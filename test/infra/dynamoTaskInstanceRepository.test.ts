import { describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import {
  createTaskInstance,
  findPendingTasksWithReminderDue,
  getTaskInstance,
  TASK_INSTANCES_TABLE_NAME,
  transitionTaskStatus,
} from '../../src/infra/dynamoTaskInstanceRepository';
import { INITIAL_TASK_STATUS, REMINDER_SENT_STATUS, TaskInstance } from '../../src/domain/taskDetection';

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

describe('transitionTaskStatus', () => {
  it('Reminder due: transitions pendente -> lembrete_enviado via UpdateCommand with a ConditionExpression on the prior status', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});

    const result = await transitionTaskStatus(
      docClient,
      'evt-123#2026-09-25',
      INITIAL_TASK_STATUS,
      REMINDER_SENT_STATUS
    );

    expect(result).toBe('transitioned');
    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input).toEqual({
      TableName: TASK_INSTANCES_TABLE_NAME,
      Key: { task_id: 'evt-123#2026-09-25' },
      UpdateExpression: 'SET #status = :to',
      ConditionExpression: '#status = :from',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':from': INITIAL_TASK_STATUS, ':to': REMINDER_SENT_STATUS },
    });
  });

  it('Already sent (retry): ConditionalCheckFailedException is caught and reported as already_transitioned, not thrown', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockRejectedValue(
      new ConditionalCheckFailedException({ message: 'ConditionalCheckFailed', $metadata: {} })
    );

    const result = await transitionTaskStatus(
      docClient,
      'evt-123#2026-09-25',
      INITIAL_TASK_STATUS,
      REMINDER_SENT_STATUS
    );

    expect(result).toBe('already_transitioned');
  });

  it('propagates any other error instead of swallowing it', async () => {
    const docClient = buildMockDocClient();
    const otherError = new Error('ProvisionedThroughputExceededException');
    docClient.send.mockRejectedValue(otherError);

    await expect(
      transitionTaskStatus(docClient, 'evt-123#2026-09-25', INITIAL_TASK_STATUS, REMINDER_SENT_STATUS)
    ).rejects.toThrow(otherError);
  });
});

describe('findPendingTasksWithReminderDue', () => {
  it('Reminder due: scans for pendente items via FilterExpression, then keeps only the ones whose reminder_at has arrived', async () => {
    const docClient = buildMockDocClient();
    const dueTask = buildTaskInstance({
      task_id: 'evt-due#2026-09-25',
      reminder_at: '2026-09-25T14:00:00-03:00',
    });
    const notYetDueTask = buildTaskInstance({
      task_id: 'evt-not-due#2026-09-25',
      reminder_at: '2026-09-25T20:00:00-03:00',
    });
    docClient.send.mockResolvedValue({ Items: [dueTask, notYetDueTask] });

    const result = await findPendingTasksWithReminderDue(docClient, '2026-09-25T17:00:00Z');

    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(ScanCommand);
    expect(command.input).toEqual({
      TableName: TASK_INSTANCES_TABLE_NAME,
      FilterExpression: '#status = :pendente',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pendente': 'pendente' },
    });
    expect(result).toEqual([dueTask]);
  });

  it('returns an empty array when the Scan finds no items', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});

    const result = await findPendingTasksWithReminderDue(docClient, '2026-09-25T17:00:00Z');

    expect(result).toEqual([]);
  });
});

describe('getTaskInstance', () => {
  it('Task invocation: returns the TaskInstance for a known task_id via GetCommand', async () => {
    const docClient = buildMockDocClient();
    const item = buildTaskInstance();
    docClient.send.mockResolvedValue({ Item: item });

    const result = await getTaskInstance(docClient, item.task_id);

    expect(result).toEqual(item);
    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: TASK_INSTANCES_TABLE_NAME,
      Key: { task_id: item.task_id },
    });
  });

  it('Unknown task_id: returns undefined instead of throwing when no item exists', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});

    const result = await getTaskInstance(docClient, 'nao-existe#2026-09-25');

    expect(result).toBeUndefined();
  });
});
