import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'aws-lambda';
import type { Request, RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';

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

    const responseEnvelope = await invokeHandler(requestEnvelope);

    const outputSpeech = responseEnvelope.response.outputSpeech;

    expect(outputSpeech).toBeDefined();
    expect(outputSpeech?.type).toBe('SSML');
    expect(outputSpeech && 'ssml' in outputSpeech ? outputSpeech.ssml : '').toEqual(
      expect.stringContaining('Desculpa')
    );
    expect(responseEnvelope.response.shouldEndSession).toBe(true);
  });
});

describe('skill.ts SessionEndedRequestHandler', () => {
  it('handles a SessionEndedRequest without throwing and without emitting output speech', async () => {
    const requestEnvelope = buildSessionEndedRequestEnvelope();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const responseEnvelope = await invokeHandler(requestEnvelope);

    expect(responseEnvelope.response.outputSpeech).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"SessionEndedRequest.handled"')
    );

    logSpy.mockRestore();
  });
});
