import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'aws-lambda';
import type { Request, RequestEnvelope, ResponseEnvelope, interfaces } from 'ask-sdk-model';

import { TaskInstance, INITIAL_TASK_STATUS } from '../../src/domain/taskDetection';

const { getTaskInstanceMock } = vi.hoisted(() => ({ getTaskInstanceMock: vi.fn() }));

vi.mock('../../src/infra/dynamoTaskInstanceRepository', () => ({
  getTaskInstance: getTaskInstanceMock,
}));

// Importado depois do vi.mock acima, pra pegar a versão mockada de
// dynamoTaskInstanceRepository (skill.ts a importa no top-level).
import { handler } from '../../src/handlers/skill';

function buildRequestEnvelope(request: Request): RequestEnvelope {
  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.test-session-id',
      application: { applicationId: 'amzn1.ask.skill.test-application-id' },
      user: { userId: 'amzn1.ask.account.test-user-id' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test-application-id' },
        user: { userId: 'amzn1.ask.account.test-user-id' },
        apiEndpoint: 'https://api.amazonalexa.com',
        apiAccessToken: 'test-api-access-token',
      },
    },
    request,
  };
}

function buildLaunchRequestEnvelope(): RequestEnvelope {
  return buildRequestEnvelope({
    type: 'LaunchRequest',
    requestId: 'amzn1.echo-api.request.test-request-id',
    timestamp: new Date().toISOString(),
    locale: 'pt-BR',
  });
}

function buildReminderTaskLaunchRequestEnvelope(taskId: unknown): RequestEnvelope {
  return buildRequestEnvelope({
    type: 'LaunchRequest',
    requestId: 'amzn1.echo-api.request.test-reminder-task',
    timestamp: new Date().toISOString(),
    locale: 'pt-BR',
    task: {
      name: 'ReminderCheckIn',
      version: '1',
      input: { task_id: taskId },
    },
  });
}

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

function buildUnhandledIntentRequestEnvelope(): RequestEnvelope {
  return buildRequestEnvelope({
    type: 'IntentRequest',
    requestId: 'amzn1.echo-api.request.test-unhandled-intent',
    timestamp: new Date().toISOString(),
    locale: 'pt-BR',
    dialogState: 'COMPLETED',
    intent: { name: 'SomeIntentWithNoRegisteredHandler', confirmationStatus: 'NONE' },
  });
}

function buildSessionEndedRequestEnvelope(): RequestEnvelope {
  return buildRequestEnvelope({
    type: 'SessionEndedRequest',
    requestId: 'amzn1.echo-api.request.test-session-ended',
    timestamp: new Date().toISOString(),
    locale: 'pt-BR',
    reason: 'USER_INITIATED',
  });
}

const noopContext = {} as Context;

type LambdaHandler = (
  event: RequestEnvelope,
  context: Context,
  callback: (error?: Error | null, result?: ResponseEnvelope) => void
) => void;

function invokeHandler(requestEnvelope: RequestEnvelope): Promise<ResponseEnvelope> {
  return new Promise((resolve, reject) => {
    (handler as unknown as LambdaHandler)(requestEnvelope, noopContext, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result as ResponseEnvelope);
    });
  });
}

describe('skill.ts LaunchRequestHandler', () => {
  it('responds to a LaunchRequest with a non-empty pt-BR speech and ends the session', async () => {
    const requestEnvelope = buildLaunchRequestEnvelope();

    const responseEnvelope = await invokeHandler(requestEnvelope);

    const outputSpeech = responseEnvelope.response.outputSpeech;

    expect(outputSpeech).toBeDefined();
    expect(outputSpeech?.type).toBe('SSML');
    expect(outputSpeech && 'ssml' in outputSpeech ? outputSpeech.ssml : '').toEqual(
      expect.stringContaining('assistente pessoal')
    );
    expect(responseEnvelope.response.shouldEndSession).toBe(true);
  });
});

describe('skill.ts GenericErrorHandler', () => {
  it('falls back to a short pt-BR apology and ends the session when no handler matches the request', async () => {
    const requestEnvelope = buildUnhandledIntentRequestEnvelope();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const responseEnvelope = await invokeHandler(requestEnvelope);

    const outputSpeech = responseEnvelope.response.outputSpeech;

    expect(outputSpeech).toBeDefined();
    expect(outputSpeech?.type).toBe('SSML');
    expect(outputSpeech && 'ssml' in outputSpeech ? outputSpeech.ssml : '').toEqual(
      expect.stringContaining('Desculpa')
    );
    expect(responseEnvelope.response.shouldEndSession).toBe(true);

    const loggedArg = logSpy.mock.calls
      .map(([arg]) => arg as string)
      .find((arg) => arg.includes('"event":"ErrorHandler.handled"'));
    expect(loggedArg).toBeDefined();
    const loggedPayload = JSON.parse(loggedArg as string) as { requestType?: string };
    expect(loggedPayload.requestType).toBe('IntentRequest');

    logSpy.mockRestore();
  });
});

describe('skill.ts SessionEndedRequestHandler', () => {
  it('handles a SessionEndedRequest without throwing and without emitting output speech', async () => {
    const requestEnvelope = buildSessionEndedRequestEnvelope();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(responseEnvelope.response.outputSpeech).toBeUndefined();

    const loggedArg = logSpy.mock.calls
      .map(([arg]) => arg as string)
      .find((arg) => arg.includes('"event":"SessionEndedRequest.handled"'));
    expect(loggedArg).toBeDefined();
    const loggedPayload = JSON.parse(loggedArg as string) as { reason?: string };
    expect(loggedPayload.reason).toBe('USER_INITIATED');

    logSpy.mockRestore();
  });
});

describe('skill.ts ReminderTaskHandler', () => {
  beforeEach(() => {
    getTaskInstanceMock.mockReset();
  });

  function getCompleteTaskDirective(
    responseEnvelope: ResponseEnvelope
  ): interfaces.tasks.CompleteTaskDirective | undefined {
    return responseEnvelope.response.directives?.find(
      (directive): directive is interfaces.tasks.CompleteTaskDirective => directive.type === 'Tasks.CompleteTask'
    );
  }

  it('Task invocation: speaks the pillar/purpose-reconnected reminder and completes the task as SUCCESSFUL', async () => {
    const taskInstance = buildTaskInstance({
      task_id: 'evt-123#2026-09-25',
      pillar: 'saude',
      purpose: 'chegar na meta de dezembro',
      task_title: 'Correr no parque',
    });
    getTaskInstanceMock.mockResolvedValueOnce(taskInstance);
    const requestEnvelope = buildReminderTaskLaunchRequestEnvelope('evt-123#2026-09-25');

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(getTaskInstanceMock).toHaveBeenCalledWith(expect.anything(), 'evt-123#2026-09-25');

    const outputSpeech = responseEnvelope.response.outputSpeech;
    expect(outputSpeech).toBeDefined();
    const speech = outputSpeech && 'ssml' in outputSpeech ? outputSpeech.ssml : '';
    expect(speech).toEqual(expect.stringContaining('Saúde'));
    expect(speech).toEqual(expect.stringContaining('chegar na meta de dezembro'));
    expect(speech).not.toEqual(expect.stringContaining('Correr no parque'));

    const completeTaskDirective = getCompleteTaskDirective(responseEnvelope);
    expect(completeTaskDirective).toBeDefined();
    expect(completeTaskDirective?.status.code).toBe('200');
    expect(responseEnvelope.response.shouldEndSession).toBe(true);
  });

  it('Unknown task_id: builds no speech from missing data and completes the task as FAILED, without crashing', async () => {
    getTaskInstanceMock.mockResolvedValueOnce(undefined);
    const requestEnvelope = buildReminderTaskLaunchRequestEnvelope('nao-existe#2026-09-25');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(responseEnvelope.response.outputSpeech).toBeUndefined();
    const completeTaskDirective = getCompleteTaskDirective(responseEnvelope);
    expect(completeTaskDirective).toBeDefined();
    expect(completeTaskDirective?.status.code).toBe('404');
    expect(responseEnvelope.response.shouldEndSession).toBe(true);

    const loggedArg = logSpy.mock.calls
      .map(([arg]) => arg as string)
      .find((arg) => arg.includes('"event":"ReminderTask.handled"'));
    expect(loggedArg).toBeDefined();
    const loggedPayload = JSON.parse(loggedArg as string) as { outcome?: string };
    expect(loggedPayload.outcome).toBe('not-found');

    logSpy.mockRestore();
  });

  it('completes the task as FAILED without calling getTaskInstance when the LaunchRequest carries no task_id', async () => {
    const requestEnvelope = buildReminderTaskLaunchRequestEnvelope(undefined);

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(getTaskInstanceMock).not.toHaveBeenCalled();
    expect(responseEnvelope.response.outputSpeech).toBeUndefined();
    const completeTaskDirective = getCompleteTaskDirective(responseEnvelope);
    expect(completeTaskDirective?.status.code).toBe('404');
  });

  it('a plain LaunchRequest with no task is not handled by ReminderTaskHandler (WELCOME_SPEECH still wins)', async () => {
    const requestEnvelope = buildLaunchRequestEnvelope();

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(getTaskInstanceMock).not.toHaveBeenCalled();
    const outputSpeech = responseEnvelope.response.outputSpeech;
    const speech = outputSpeech && 'ssml' in outputSpeech ? outputSpeech.ssml : '';
    expect(speech).toEqual(expect.stringContaining('assistente pessoal'));
  });
});
