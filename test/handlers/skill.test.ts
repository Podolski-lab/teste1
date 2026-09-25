import { describe, expect, it } from 'vitest';
import type { Context } from 'aws-lambda';
import type { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';

import { handler } from '../../src/handlers/skill';

function buildLaunchRequestEnvelope(): RequestEnvelope {
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
    request: {
      type: 'LaunchRequest',
      requestId: 'amzn1.echo-api.request.test-request-id',
      timestamp: new Date().toISOString(),
      locale: 'pt-BR',
    },
  };
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
