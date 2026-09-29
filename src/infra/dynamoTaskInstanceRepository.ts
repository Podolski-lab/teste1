/**
 * Leitura/escrita em `TaskInstances`. Criação idempotente de itens pelo
 * Poller (Story 1.3): `PutCommand` com `ConditionExpression:
 * attribute_not_exists(task_id)` garante que um re-poll do mesmo evento no
 * mesmo dia (mesmo `task_id`) não duplica o item nem sobrescreve
 * `status`/`checkpoint_attempts` já em andamento (AD-3's spirit, estendido
 * pra criação). Transição de status idempotente e leituras pro lembrete de
 * voz (Story 1.4): `transitionTaskStatus` (AD-3 — único lugar que escreve
 * `TaskInstance.status`), `findPendingTasksWithReminderDue` e
 * `getTaskInstance`. Segue o mesmo padrão de Story 1.2 (testável via
 * `DynamoDBDocumentClient` mockado, sem AWS real).
 */
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { TaskInstance, TaskStatus } from '../domain/taskDetection';
import { isReminderDue } from '../domain/taskState';

export const TASK_INSTANCES_TABLE_NAME = 'TaskInstances';

export type CreateTaskInstanceResult = 'created' | 'already_exists';

/**
 * Cria um item em `TaskInstances`, sem sobrescrever um item já existente
 * para o mesmo `task_id`. Quando o item já existe, o `PutCommand` falha com
 * `ConditionalCheckFailedException`, que é capturada aqui e traduzida em
 * `'already_exists'` — o chamador (o Poller) não vê exceção nesse caso, só
 * um no-op esperado (I/O matrix: "Re-poll").
 */
export async function createTaskInstance(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  item: TaskInstance
): Promise<CreateTaskInstanceResult> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TASK_INSTANCES_TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(task_id)',
      })
    );
    return 'created';
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return 'already_exists';
    }
    throw error;
  }
}

export type TransitionTaskStatusResult = 'transitioned' | 'already_transitioned';

/**
 * Transiciona `TaskInstance.status` de `from` pra `to`, condicionado a
 * `status` ainda valer `from` no momento da escrita (AD-3). É o único lugar
 * em todo o código que escreve o campo `status` — nem o Poller nem o Skill
 * Handler tocam nele diretamente.
 *
 * Quando o `ConditionExpression` falha (porque outra invocação, ou um retry
 * automático do Lambda, já aplicou a transição), a
 * `ConditionalCheckFailedException` é capturada e traduzida em
 * `'already_transitioned'` — o chamador não vê exceção, só um sinal pra não
 * repetir o efeito que essa transição autoriza (ex.: disparar um trigger da
 * Alexa de novo). Mesmo padrão de `createTaskInstance` acima.
 */
export async function transitionTaskStatus(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  taskId: string,
  from: TaskStatus,
  to: TaskStatus
): Promise<TransitionTaskStatusResult> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TASK_INSTANCES_TABLE_NAME,
        Key: { task_id: taskId },
        UpdateExpression: 'SET #status = :to',
        ConditionExpression: '#status = :from',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':from': from, ':to': to },
      })
    );
    return 'transitioned';
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return 'already_transitioned';
    }
    throw error;
  }
}

/**
 * Busca todas as `TaskInstance`s `pendente`s cujo `reminder_at` já chegou
 * (I/O matrix: "Reminder due"), pro Poller decidir quais disparar.
 *
 * `FilterExpression` no Scan só restringe por `status = pendente` — uma
 * comparação exata e inequívoca. A comparação de horário (`reminder_at` vs.
 * `nowIso`) é feita depois, em memória, via `isReminderDue` (domínio puro):
 * `reminder_at` é gravado com o offset local do Google Calendar enquanto
 * `nowIso` normalmente é UTC (`Z`), e uma `FilterExpression` só compara
 * strings — não instantes — então filtrar por horário direto no Dynamo
 * arriscaria comparar strings em formatos diferentes de um jeito que não
 * preserva a ordem cronológica. Ver Design Notes da spec 1.4 ("Scan, not a
 * GSI") pra por que isso é um `Scan`, não uma `Query` numa GSI.
 */
export async function findPendingTasksWithReminderDue(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  nowIso: string
): Promise<TaskInstance[]> {
  const items: TaskInstance[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TASK_INSTANCES_TABLE_NAME,
        FilterExpression: '#status = :pendente',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pendente': 'pendente' },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...((result.Items ?? []) as TaskInstance[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return items.filter((item) => isReminderDue(item, nowIso));
}

/**
 * Busca uma única `TaskInstance` pelo `task_id` — usado pelo Skill Handler
 * (Story 1.4) quando a Custom Task de lembrete roda, pra ler
 * `pillar`/`purpose` (nunca relidos ao vivo do `PillarConfig`, AD-3) e
 * montar a fala. Retorna `undefined` quando não há item pra esse `task_id`
 * (I/O matrix: "Unknown task_id").
 */
export async function getTaskInstance(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  taskId: string
): Promise<TaskInstance | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TASK_INSTANCES_TABLE_NAME,
      Key: { task_id: taskId },
    })
  );

  return result.Item as TaskInstance | undefined;
}
