/**
 * Entrypoint do Lambda "skill-handler" (Story 1.1). Story 1.4 adiciona
 * `ReminderTaskHandler`: quando uma Alexa Routine dispara a Custom Task de
 * lembrete, a Alexa invoca a Skill com um `LaunchRequest` carregando
 * `task.input.task_id` — este handler lê a `TaskInstance` correspondente e
 * fala o lembrete reconectado ao pilar/propósito (nunca só o título do
 * evento — UX rule da spec 1.4).
 *
 * O stub de SessionEndedRequest continua sem traduzir nada em
 * `transitionTaskStatus`: a transição `aguardando_checkpoint` em diante é
 * da Story 1.5 (ver Design Notes da spec 1.1 e AD-2).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import Alexa, {
  ErrorHandler,
  HandlerInput,
  RequestHandler,
  SkillBuilders,
} from 'ask-sdk-core';
import { interfaces, Response } from 'ask-sdk-model';

import { buildReminderSpeech } from '../domain/taskState';
import { getTaskInstance } from '../infra/dynamoTaskInstanceRepository';

const WELCOME_SPEECH =
  'Olá! Eu sou o seu assistente pessoal. Em breve vou te ajudar a manter o ritmo ' +
  'nas tarefas dos seus pilares, sempre lembrando por que elas importam. Até já!';

const FALLBACK_ERROR_SPEECH =
  'Desculpa, tive um problema para entender o seu pedido. Pode tentar de novo?';

// Criado uma vez por container do Lambda (fora dos handlers) e reusado entre
// invocações warm — mesmo padrão de cliente AWS SDK recomendado pra Lambda.
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Loga uma linha JSON estruturada, seguindo a convenção de logging da
 * Architecture Spine (Consistency Conventions > Estado & cross-cutting).
 */
function logStructured(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...data }));
}

/**
 * Monta a diretiva `Tasks.CompleteTask` que fecha o Custom Task invocado
 * pela Routine (I/O matrix da spec 1.4). O `status` desse tipo, no
 * `ask-sdk-model` instalado, é um objeto `{ code, message }` (protocolo
 * inspirado em HTTP status codes) — não uma string `'SUCCESSFUL'`/`'FAILED'`
 * solta; `outcome` abaixo é o rótulo semântico usado no resto deste arquivo
 * e nos logs, traduzido pro shape real da diretiva aqui.
 */
function buildCompleteTaskDirective(
  outcome: 'SUCCESSFUL' | 'FAILED'
): interfaces.tasks.CompleteTaskDirective {
  if (outcome === 'SUCCESSFUL') {
    return {
      type: 'Tasks.CompleteTask',
      status: { code: '200', message: 'Lembrete falado com sucesso.' },
    };
  }

  return {
    type: 'Tasks.CompleteTask',
    status: { code: '404', message: 'TaskInstance não encontrada para o task_id recebido.' },
  };
}

/**
 * Handler da Custom Task de lembrete (Story 1.4 / FR-2). Registrado antes
 * de `LaunchRequestHandler` porque um `LaunchRequest` disparado por Routine
 * carrega `task` (`ask-sdk-model`'s `LaunchRequest.task?: {name, version,
 * input}`) e precisa ser distinguido de uma abertura comum da skill, que
 * não carrega esse campo.
 */
export const ReminderTaskHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    const { request } = handlerInput.requestEnvelope;
    return request.type === 'LaunchRequest' && Boolean(request.task);
  },
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const { request } = handlerInput.requestEnvelope;
    const task = request.type === 'LaunchRequest' ? request.task : undefined;
    const taskId = typeof task?.input?.task_id === 'string' ? (task.input.task_id as string) : undefined;

    if (!taskId) {
      logStructured('ReminderTask.handled', { outcome: 'missing-task-id' });
      return handlerInput.responseBuilder
        .addDirective(buildCompleteTaskDirective('FAILED'))
        .withShouldEndSession(true)
        .getResponse();
    }

    const taskInstance = await getTaskInstance(docClient, taskId);

    if (!taskInstance) {
      logStructured('ReminderTask.handled', { taskId, outcome: 'not-found' });
      return handlerInput.responseBuilder
        .addDirective(buildCompleteTaskDirective('FAILED'))
        .withShouldEndSession(true)
        .getResponse();
    }

    logStructured('ReminderTask.handled', { taskId, outcome: 'spoken' });

    return handlerInput.responseBuilder
      .speak(buildReminderSpeech(taskInstance))
      .addDirective(buildCompleteTaskDirective('SUCCESSFUL'))
      .withShouldEndSession(true)
      .getResponse();
  },
};

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
 * `transitionTaskStatus` — a transição pra `aguardando_checkpoint` em
 * diante (a partir de uma sessão de checkpoint encerrando) é da Story 1.5,
 * não desta (ver Design Notes da spec 1.1 e AD-2).
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
  .addRequestHandlers(ReminderTaskHandler, LaunchRequestHandler, SessionEndedRequestHandler)
  .addErrorHandlers(GenericErrorHandler)
  .lambda();
