/**
 * CLI local que associa um evento de calendário a um pilar e propósito,
 * fazendo upsert em PillarConfig (Story 1.2 / FR-11).
 *
 * Uso:
 *   npm run associar-pilar -- "<nome do evento>" <pilar> "<propósito>"
 *
 * Requer credenciais AWS próprias do usuário configuradas localmente
 * (ex.: `aws configure`) e a tabela `PillarConfig` já implantada via
 * `sam deploy` (ver template.yaml). Este script é o único escritor de
 * PillarConfig (AD-5) — nenhum Lambda em src/handlers lê ou escreve esta
 * tabela nesta story.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

/** Os quatro pilares fixos definidos no planejamento — nenhum outro valor é aceito. */
export const VALID_PILLARS = ['saude', 'profissional', 'projetos-pessoais', 'lazer'] as const;

export type Pillar = (typeof VALID_PILLARS)[number];

export const TABLE_NAME = 'PillarConfig';

/** Lançado quando os argumentos posicionais são insuficientes. */
export class UsageError extends Error {}

/** Lançado quando o pilar informado não é um dos quatro valores válidos. */
export class InvalidPillarError extends Error {}

export const USAGE_MESSAGE =
  'Uso: associar-pilar.ts "<nome do evento>" <pilar> "<propósito>"\n' +
  `Pilares válidos: ${VALID_PILLARS.join(', ')}`;

export interface ParsedArgs {
  eventName: string;
  pillar: string;
  purpose: string;
}

/**
 * Extrai os 3 argumentos posicionais (nome do evento, pilar, propósito) de
 * um array de argumentos (tipicamente `process.argv.slice(2)`).
 *
 * Não valida o pilar — isso é responsabilidade de `validatePillar`.
 */
export function parseArgs(args: string[]): ParsedArgs {
  if (args.length !== 3) {
    throw new UsageError(USAGE_MESSAGE);
  }

  const [eventNameRaw, pillar, purposeRaw] = args;
  const eventName = eventNameRaw.trim();
  const purpose = purposeRaw.trim();

  if (eventName.length === 0) {
    throw new UsageError(USAGE_MESSAGE);
  }

  return { eventName, pillar, purpose };
}

/**
 * Valida que `pillar` é um dos quatro pilares fixos, aceitando entrada
 * case-insensitive e retornando a forma normalizada (minúscula).
 */
export function validatePillar(pillar: string): Pillar {
  const normalized = pillar
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (!(VALID_PILLARS as readonly string[]).includes(normalized)) {
    throw new InvalidPillarError(
      `Pilar inválido: "${pillar}". Valores válidos: ${VALID_PILLARS.join(', ')}`,
    );
  }

  return normalized as Pillar;
}

/**
 * Faz upsert de um item em PillarConfig via PutItem: a mesma chave
 * (`calendar_event_pattern`) sempre sobrescreve o item existente em vez de
 * duplicar, então não há branch separado para "criar" vs "atualizar".
 */
export async function upsertPillarConfig(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  eventName: string,
  pillar: Pillar,
  purpose: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        calendar_event_pattern: eventName,
        pillar,
        purpose,
      },
    }),
  );
}

async function main(): Promise<void> {
  const { eventName, pillar, purpose } = parseArgs(process.argv.slice(2));
  const validatedPillar = validatePillar(pillar);

  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  await upsertPillarConfig(docClient, eventName, validatedPillar, purpose);

  console.log(
    `OK: evento "${eventName}" associado ao pilar "${validatedPillar}" (propósito: "${purpose}").`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    if (error instanceof UsageError || error instanceof InvalidPillarError) {
      console.error(error.message);
    } else {
      console.error('Erro ao gravar em PillarConfig:', error);
    }
    process.exitCode = 1;
  });
}
