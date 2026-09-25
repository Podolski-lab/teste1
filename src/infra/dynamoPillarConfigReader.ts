/**
 * Leitura de `PillarConfig` (Story 1.2) pelo Poller — contraparte read-only
 * do CLI `scripts/associar-pilar.ts`, que é o único escritor da tabela
 * (AD-5). Nenhum código aqui grava em `PillarConfig`.
 */
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

import { PillarConfigEntry } from '../domain/taskDetection';

export const PILLAR_CONFIG_TABLE_NAME = 'PillarConfig';

/**
 * Busca a entrada de `PillarConfig` para o título (trimado) de um evento do
 * Calendar. `PillarConfig`'s primary key já é o padrão literal (Story 1.2) —
 * então isso é um `GetItem` direto pela chave, não uma busca fuzzy/substring
 * (ver Design Notes da spec 1.3: "o casamento com eventos reais do Calendar
 * é definido na Story 1.3" — resolvido aqui como lookup exato).
 *
 * Retorna `undefined` quando não há entrada para esse título.
 */
export async function getPillarConfigForEvent(
  docClient: Pick<DynamoDBDocumentClient, 'send'>,
  eventTitle: string
): Promise<PillarConfigEntry | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PILLAR_CONFIG_TABLE_NAME,
      Key: {
        calendar_event_pattern: eventTitle.trim(),
      },
    })
  );

  const item = result.Item;
  if (!item) {
    return undefined;
  }

  if (typeof item.pillar !== 'string' || typeof item.purpose !== 'string') {
    return undefined;
  }

  return {
    pillar: item.pillar,
    purpose: item.purpose,
  };
}
