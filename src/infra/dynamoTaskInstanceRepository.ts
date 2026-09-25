/**
 * Escrita em `TaskInstances` (Story 1.3) — criação idempotente de itens pelo
 * Poller. `PutCommand` com `ConditionExpression: attribute_not_exists(task_id)`
 * garante que um re-poll do mesmo evento no mesmo dia (mesmo `task_id`) não
 * duplica o item nem sobrescreve `status`/`checkpoint_attempts` já em
 * andamento (AD-3's spirit, estendido pra criação). Segue o mesmo padrão de
 * Story 1.2 (testável via `DynamoDBDocumentClient` mockado, sem AWS real).
 */
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { TaskInstance } from '../domain/taskDetection';

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
