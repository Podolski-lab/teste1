/**
 * Cliente HTTP pro mecanismo de Custom Triggers for Routines da Alexa
 * (Story 1.4 / AD-4). Duas responsabilidades: obter um access token via LWA
 * (`getAccessToken`) e disparar um trigger pré-registrado
 * (`fireTrigger`) — usados pelo Poller depois que `transitionTaskStatus`
 * confirma a transição `pendente` -> `lembrete_enviado` (nunca antes; ver
 * "Firing order" nas Design Notes da spec 1.4).
 *
 * Usa `fetch` nativo do runtime Node 24 do Lambda — nenhuma dependência
 * HTTP nova (`node-fetch`, `axios`, etc.).
 *
 * *** AVISO: schema best-effort, não confirmado contra a documentação
 * oficial ***
 * A sessão que escreveu este arquivo não tinha acesso a
 * developer.amazon.com (rede bloqueada). A Amazon rotula Custom Triggers
 * for Routines como "developer preview" ("might change"). O shape do corpo
 * de `POST /v1/routines/triggerInstances` abaixo (`request.requestId`,
 * `request.delivery`, `request.trigger.name`/`.parameters`) segue os
 * exemplos de request body da própria "Routines Trigger Instance REST API
 * Reference" (developer.amazon.com/en-US/docs/alexa/routines/
 * routines-custom-trigger-api-reference.html), obtidos via busca web nesta
 * sessão (não fetch direto) — cruze contra a documentação atual da Amazon
 * antes de depender disso em produção (ver README, seção sobre Custom
 * Triggers).
 */

import { randomUUID } from 'node:crypto';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const TRIGGER_INSTANCES_URL = 'https://api.amazonalexa.com/v1/routines/triggerInstances';
const TRIGGER_INSTANCES_SCOPE = 'alexa::routines:triggerinstances:write';

export type TriggerStage = 'development' | 'live';

interface LwaTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Troca `clientId`/`clientSecret` (credenciais de Alexa Skill Messaging —
 * Developer Console > Permissions > Send Alexa Events, ver README) por um
 * access token via LWA client-credentials grant. Essas credenciais chegam
 * aqui só como variáveis de ambiente do Lambda do Poller (`NoEcho` SAM
 * parameters em `template.yaml`) — nunca passaram pela sessão que
 * implementou esta story (AD-6 estendida).
 */
export async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: TRIGGER_INSTANCES_SCOPE,
    }).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao obter access token da LWA (${response.status}): ${errorBody}`);
  }

  const body = (await response.json()) as LwaTokenResponse;
  if (!body.access_token) {
    throw new Error('Resposta da LWA não trouxe access_token.');
  }

  return body.access_token;
}

/**
 * Dispara `triggerName` (um dos dois valores fixos de AD-4:
 * `reminder-trigger`/`checkpoint-trigger`) via Alexa Routines Trigger
 * Instance API, com `parameters` como payload (AD-4: `{ task_id }`
 * somente). O corpo é `{ request: { requestId, delivery, trigger: { name,
 * parameters } } }` — um `requestId` novo (UUID) por chamada, conforme os
 * exemplos oficiais da API. Usa `delivery: MULTICAST` — não `UNICAST` —
 * porque MULTICAST não exige um `recipient` com bearer token per-customer
 * (ver Design Notes da spec 1.4: "MULTICAST over UNICAST"); pra uma skill
 * de um usuário só, as duas são operacionalmente equivalentes.
 *
 * `stage` mira o endpoint de desenvolvimento por padrão
 * (`ALEXA_TRIGGER_STAGE`, default `development` — ver `poller.ts`) — a
 * decisão do usuário de testar contra a stage de desenvolvimento antes de
 * qualquer certificação/publicação (ver Intent da spec 1.4).
 */
export async function fireTrigger(
  triggerName: string,
  parameters: Record<string, string>,
  accessToken: string,
  stage: TriggerStage = 'development'
): Promise<void> {
  const url = stage === 'live' ? TRIGGER_INSTANCES_URL : `${TRIGGER_INSTANCES_URL}/stages/development`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request: {
        requestId: randomUUID(),
        delivery: 'MULTICAST',
        trigger: {
          name: triggerName,
          parameters,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Falha ao disparar trigger "${triggerName}" na stage "${stage}" (${response.status}): ${errorBody}`
    );
  }
}
