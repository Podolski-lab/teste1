import { describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import { createTaskInstance, TASK_INSTANCES_TABLE_NAME } from '../../src/infra/dynamoTaskInstanceRepository';
import { INITIAL_TASK_STATUS, TaskInstance } from '../../src/domain/taskDetection';

function buildTaskInstance(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    task_id: 'evt-123#2026-09-25',
    calendar_event_id: 'evt-123',
    date: '2026-09-25',
    pillar: 'saude',
    purpose: 'chegar na meta de dezembro',
    task_title: 'Correr no parque',
    status: INITIAL_TASK_STATUS,
    checkpoint_attempts: 0,
    reminder_at: '2026-09-25T14:00:00-03:00',
    checkpoint_at: '2026-09-25T15:00:00-03:00',
    ...overrides,
  };
}

function buildMockDocClient() {
  return { send: vi.fn() };
}

describe('createTaskInstance', () => {
  it('Matched task: creates the item via PutCommand with ConditionExpression attribute_not_exists(task_id)', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});
    const item = buildTaskInstance();

    const result = await createTaskInstance(docClient, item);

    expect(result).toBe('created');
    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual({
      TableName: TASK_INSTANCES_TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(task_id)',
    });
  });

  it('Re-poll: ConditionalCheckFailedException is caught and reported as already_exists, not thrown', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'ConditionalCheckFailed', $metadata: {} })
    );
    const item = buildTaskInstance();

    const result = await createTaskInstance(docClient, item);

    expect(result).toBe('already_exists');
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  it('propagates any other error instead of swallowing it', async () => {
    const docClient = buildMockDocClient();
    const otherError = new Error('ProvisionedThroughputExceededException');
    docClient.send.mockRejectedValue(otherError);
    const item = buildTaskInstance();

    await expect(createTaskInstance(docClient, item)).rejects.toThrow(otherError);
  });

  it('a second call for the same task_id does not throw and does not change the outcome of the first', async () => {
    const docClient = buildMockDocClient();
    docClient.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'ConditionalCheckFailed', $metadata: {} })
      );
    const item = buildTaskInstance();

    const first = await createTaskInstance(docClient, item);
    const second = await createTaskInstance(docClient, item);

    expect(first).toBe('created');
    expect(second).toBe('already_exists');
  });
});
