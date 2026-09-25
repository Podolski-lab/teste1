/**
 * Entrypoint do Lambda "skill-handler" (Story 1.1).
 *
 * Registra apenas os handlers exigidos para a Skill responder a uma
 * invocação e se comportar corretamente nos casos de borda mínimos
 * (erro genérico, fim de sessão). Nenhuma lógica de domínio ainda
 * existe (src/domain/ está vazio nesta story - AD-1); o stub de
 * SessionEndedRequest não traduz nada em transitionTaskStatus porque
 * essa função e a tabela TaskInstances só existirão a partir das
 * Stories 1.2/1.3/1.5 (ver Design Notes da spec 1.1 e AD-2).
 */

import Alexa, {
  ErrorHandler,
  HandlerInput,
  RequestHandler,
  SkillBuilders,
} from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';

const WELCOME_SPEECH =
  'Olá! Eu sou o seu assistente pessoal. Em breve vou te ajudar a manter o ritmo ' +
  'nas tarefas dos seus pilares, sempre lembrando por que elas importam. Até já!';

const FALLBACK_ERROR_SPEECH =
  'Desculpa, tive um problema para entender o seu pedido. Pode tentar de novo?';

/**
 * Loga uma linha JSON estruturada, seguindo a convenção de logging da
 * Architecture Spine (Consistency Conventions > Estado & cross-cutting).
 */
function logStructured(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...data }));
}

export const LaunchRequestHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput: HandlerInput): Response {
    logStructured('LaunchRequest.handled', {
      requestId: handlerInput.requestEnvelope.request.requestId,
    });

    return handlerInput.responseBuilder
      .speak(WELCOME_SPEECH)
      .withShouldEndSession(true)
      .getResponse();
  },
};

/**
 * Stub intencional: apenas loga o motivo do fim de sessão. Não chama
 * nenhuma transição de domínio (não existe transitionTaskStatus nem
 * TaskInstances ainda - ver Design Notes da spec 1.1).
 */
export const SessionEndedRequestHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest'
    );
  },
  handle(handlerInput: HandlerInput): Response {
    const { request } = handlerInput.requestEnvelope;
    const reason =
      request.type === 'SessionEndedRequest' ? request.reason : 'UNKNOWN';
    const error =
      request.type === 'SessionEndedRequest' ? request.error : undefined;

    logStructured('SessionEndedRequest.handled', {
      reason,
      ...(error ? { error } : {}),
    });

    // SessionEndedRequest não aceita outputSpeech - apenas encerra.
    return handlerInput.responseBuilder.getResponse();
  },
};

export const GenericErrorHandler: ErrorHandler = {
  canHandle(): boolean {
    return true;
  },
  handle(handlerInput: HandlerInput, error: Error): Response {
    logStructured('ErrorHandler.handled', {
      requestId: handlerInput.requestEnvelope.request.requestId,
      requestType: handlerInput.requestEnvelope.request.type,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    return handlerInput.responseBuilder
      .speak(FALLBACK_ERROR_SPEECH)
      .withShouldEndSession(true)
      .getResponse();
  },
};

export const handler = SkillBuilders.custom()
  .addRequestHandlers(LaunchRequestHandler, SessionEndedRequestHandler)
  .addErrorHandlers(GenericErrorHandler)
  .lambda();
