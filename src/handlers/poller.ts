/**
 * Entrypoint do Lambda "Poller" (Story 1.3), disparado por uma regra
 * agendada do EventBridge a cada 10 minutos. Lê os eventos de hoje do
 * Google Calendar do usuário, resolve cada um contra `PillarConfig` e cria
 * uma `TaskInstance` idempotente por evento casado. Story 1.4 adiciona uma
 * segunda fase, depois da detecção: encontra `TaskInstance`s `pendente`s
 * cujo `reminder_at` chegou, transiciona cada uma pra `lembrete_enviado`
 * (AD-3, `ConditionExpression`-gated) e só então dispara `reminder-trigger`
 * — a transição bem-sucedida é o que autoriza o disparo, prevenindo que um
 * retry do Lambda dispare o trigger duas vezes.
 *
 * Nenhuma lógica de casamento/congelamento/forma do item vive aqui (AD-2) —
 * isso é `buildTaskInstanceIfMatched`/`isReminderDue`, em `src/domain/`.
 * Este handler só lê variáveis de ambiente e orquestra os adaptadores.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  buildTaskInstanceIfMatched,
  INITIAL_TASK_STATUS,
  REMINDER_SENT_STATUS,
  TaskInstance,
} from '../domain/taskDetection';
import { listTimedEventsForDay } from '../infra/googleCalendarClient';
import { getPillarConfigForEvent } from '../infra/dynamoPillarConfigReader';
import {
  createTaskInstance,
  findPendingTasksWithReminderDue,
  transitionTaskStatus,
} from '../infra/dynamoTaskInstanceRepository';
import { fireTrigger, getAccessToken, TriggerStage } from '../infra/alexaTriggerClient';

/** Nome fixo do Custom Trigger de lembrete (AD-4) — o outro, `checkpoint-trigger`, é da Story 1.5. */
const REMINDER_TRIGGER_NAME = 'reminder-trigger';

/**
 * Loga uma linha JSON estruturada, seguindo a convenção de logging da
 * Architecture Spine (Consistency Conventions > Estado & cross-cutting).
 */
function logStructured(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...data }));
}

/** `YYYY-MM-DD` de "hoje" em `timeZone` (IANA), sem depender do fuso do runtime do Lambda. */
function todayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // 'en-CA' formata como YYYY-MM-DD.
  return formatter.format(new Date());
}

function requiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export async function handler(): Promise<void> {
  const calendarId = requiredEnvVar('GOOGLE_CALENDAR_ID');
  const timeZone = requiredEnvVar('USER_TIMEZONE');
  // GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 é lida diretamente por
  // googleCalendarClient.ts (adaptador que a consome).
  const skillMessagingClientId = requiredEnvVar('ALEXA_SKILL_MESSAGING_CLIENT_ID');
  const skillMessagingClientSecret = requiredEnvVar('ALEXA_SKILL_MESSAGING_CLIENT_SECRET');
  // Mira a stage de desenvolvimento por padrão (ver Intent da spec 1.4: testar
  // contra development antes de qualquer certificação/publicação).
  const triggerStage = (process.env.ALEXA_TRIGGER_STAGE as TriggerStage | undefined) ?? 'development';

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const today = todayInTimeZone(timeZone);

  let events;
  try {
    events = await listTimedEventsForDay(calendarId, today, timeZone);
  } catch (error) {
    logStructured('Poller.failed', {
      date: today,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logStructured('Poller.started', { date: today, eventCount: events.length });

  for (const event of events) {
    if (!event.start.dateTime || !event.end.dateTime) {
      logStructured('Poller.event.skipped', {
        calendarEventId: event.id,
        title: event.summary,
        outcome: 'all-day-skipped',
      });
      continue;
    }

    try {
      const pillarConfig = await getPillarConfigForEvent(docClient, event.summary);
      const taskInstance = buildTaskInstanceIfMatched(event, pillarConfig, today);

      if (!taskInstance) {
        logStructured('Poller.event.skipped', {
          calendarEventId: event.id,
          title: event.summary,
          outcome: 'no-match',
        });
        continue;
      }

      const result = await createTaskInstance(docClient, taskInstance);
      logStructured('Poller.event.processed', {
        calendarEventId: event.id,
        taskId: taskInstance.task_id,
        outcome: result === 'created' ? 'created' : 'already-exists',
      });
    } catch (error) {
      logStructured('Poller.event.error', {
        calendarEventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  // Fase de disparo de lembrete (Story 1.4) — roda depois da detecção acima,
  // independente do que aconteceu nela (uma TaskInstance pronta pro lembrete
  // pode ter sido criada em qualquer execução anterior, não só nesta).
  const nowIso = new Date().toISOString();
  let dueTasks: TaskInstance[];
  try {
    dueTasks = await findPendingTasksWithReminderDue(docClient, nowIso);
  } catch (error) {
    logStructured('Poller.reminder.scan.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    dueTasks = [];
  }

  logStructured('Poller.reminder.scan', { dueCount: dueTasks.length });

  for (const task of dueTasks) {
    try {
      const transitionResult = await transitionTaskStatus(
        docClient,
        task.task_id,
        INITIAL_TASK_STATUS,
        REMINDER_SENT_STATUS
      );

      if (transitionResult === 'already_transitioned') {
        logStructured('Poller.reminder.already_sent', { taskId: task.task_id });
        continue;
      }

      // A transição já valeu a partir daqui — se o disparo do trigger abaixo
      // falhar, o status fica em lembrete_enviado mesmo assim (ver Design
      // Notes "Firing order" da spec 1.4: reverter reintroduziria a mesma
      // corrida de disparo duplo que o ConditionExpression existe pra evitar;
      // limitação aceita, não é retried automaticamente nesta story).
      const accessToken = await getAccessToken(skillMessagingClientId, skillMessagingClientSecret);
      await fireTrigger(REMINDER_TRIGGER_NAME, { task_id: task.task_id }, accessToken, triggerStage);
      logStructured('Poller.reminder.sent', { taskId: task.task_id });
    } catch (error) {
      logStructured('Poller.reminder.failed', {
        taskId: task.task_id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logStructured('Poller.finished', { date: today });
}
