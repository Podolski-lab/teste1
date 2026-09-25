/**
 * Entrypoint do Lambda "Poller" (Story 1.3), disparado por uma regra
 * agendada do EventBridge a cada 10 minutos. Lê os eventos de hoje do
 * Google Calendar do usuário, resolve cada um contra `PillarConfig` e cria
 * uma `TaskInstance` idempotente por evento casado.
 *
 * Nenhuma lógica de casamento/congelamento/forma do item vive aqui (AD-2) —
 * isso é `buildTaskInstanceIfMatched`, em `src/domain/taskDetection.ts`.
 * Este handler só lê variáveis de ambiente e orquestra os adaptadores.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { buildTaskInstanceIfMatched } from '../domain/taskDetection';
import { listTimedEventsForDay } from '../infra/googleCalendarClient';
import { getPillarConfigForEvent } from '../infra/dynamoPillarConfigReader';
import { createTaskInstance } from '../infra/dynamoTaskInstanceRepository';

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

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  const today = todayInTimeZone(timeZone);
  const events = await listTimedEventsForDay(calendarId, today, timeZone);

  logStructured('Poller.started', { date: today, eventCount: events.length });

  for (const event of events) {
    const pillarConfig = await getPillarConfigForEvent(docClient, event.summary);
    const taskInstance = buildTaskInstanceIfMatched(event, pillarConfig, today);

    if (!taskInstance) {
      const outcome = event.start.dateTime ? 'no-match' : 'all-day-skipped';
      logStructured('Poller.event.skipped', {
        calendarEventId: event.id,
        title: event.summary,
        outcome,
      });
      continue;
    }

    const result = await createTaskInstance(docClient, taskInstance);
    logStructured('Poller.event.processed', {
      calendarEventId: event.id,
      taskId: taskInstance.task_id,
      outcome: result === 'created' ? 'created' : 'already-exists',
    });
  }

  logStructured('Poller.finished', { date: today });
}
