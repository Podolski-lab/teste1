import { describe, expect, it, vi } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { getPillarConfigForEvent, PILLAR_CONFIG_TABLE_NAME } from '../../src/infra/dynamoPillarConfigReader';

function buildMockDocClient() {
  return { send: vi.fn() };
}

describe('getPillarConfigForEvent', () => {
  it('builds a GetCommand with TableName PillarConfig and the trimmed title as Key', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});

    await getPillarConfigForEvent(docClient, '  Correr no parque  ');

    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: PILLAR_CONFIG_TABLE_NAME,
      Key: { calendar_event_pattern: 'Correr no parque' },
    });
  });

  it('a found item with valid string pillar/purpose maps correctly', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({
      Item: { calendar_event_pattern: 'Correr no parque', pillar: 'saude', purpose: 'chegar na meta de dezembro' },
    });

    const result = await getPillarConfigForEvent(docClient, 'Correr no parque');

    expect(result).toEqual({ pillar: 'saude', purpose: 'chegar na meta de dezembro' });
  });

  it('returns undefined when no item is found', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({});

    const result = await getPillarConfigForEvent(docClient, 'Evento sem config');

    expect(result).toBeUndefined();
  });

  it('returns undefined when the found item has a non-string pillar', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({
      Item: { calendar_event_pattern: 'Correr no parque', pillar: 42, purpose: 'chegar na meta de dezembro' },
    });

    const result = await getPillarConfigForEvent(docClient, 'Correr no parque');

    expect(result).toBeUndefined();
  });

  it('returns undefined when the found item has a non-string purpose', async () => {
    const docClient = buildMockDocClient();
    docClient.send.mockResolvedValue({
      Item: { calendar_event_pattern: 'Correr no parque', pillar: 'saude', purpose: null },
    });

    const result = await getPillarConfigForEvent(docClient, 'Correr no parque');

    expect(result).toBeUndefined();
  });
});
