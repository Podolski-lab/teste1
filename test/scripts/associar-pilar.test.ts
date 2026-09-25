import { describe, expect, it, vi } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

import {
  InvalidPillarError,
  parseArgs,
  TABLE_NAME,
  UsageError,
  USAGE_MESSAGE,
  upsertPillarConfig,
  validatePillar,
  VALID_PILLARS,
} from '../../scripts/associar-pilar';

describe('parseArgs', () => {
  it('extrai nome do evento, pilar e propósito de argumentos válidos', () => {
    const parsed = parseArgs(['Reunião de time', 'profissional', 'Fechar Q4 no prazo']);

    expect(parsed).toEqual({
      eventName: 'Reunião de time',
      pillar: 'profissional',
      purpose: 'Fechar Q4 no prazo',
    });
  });

  it('lança UsageError quando há menos de 3 argumentos', () => {
    expect(() => parseArgs(['Reunião de time', 'profissional'])).toThrow(UsageError);
  });

  it('lança UsageError quando há mais de 3 argumentos', () => {
    expect(() =>
      parseArgs(['Reunião', 'de', 'time', 'profissional', 'Fechar Q4 no prazo']),
    ).toThrow(UsageError);
  });

  it('a UsageError inclui a mensagem de uso', () => {
    try {
      parseArgs([]);
      expect.fail('deveria ter lançado UsageError');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as Error).message).toBe(USAGE_MESSAGE);
    }
  });

  it('lança UsageError quando eventName é vazio ou só espaços', () => {
    expect(() => parseArgs(['', 'profissional', 'Fechar Q4 no prazo'])).toThrow(UsageError);
    expect(() => parseArgs(['   ', 'profissional', 'Fechar Q4 no prazo'])).toThrow(UsageError);
  });

  it('remove espaços nas bordas de eventName e purpose', () => {
    const parsed = parseArgs(['  Reunião de time  ', 'profissional', '  Fechar Q4 no prazo  ']);

    expect(parsed).toEqual({
      eventName: 'Reunião de time',
      pillar: 'profissional',
      purpose: 'Fechar Q4 no prazo',
    });
  });
});

describe('validatePillar', () => {
  it.each(VALID_PILLARS)('aceita o pilar válido "%s"', (pillar) => {
    expect(validatePillar(pillar)).toBe(pillar);
  });

  it('aceita entrada case-insensitive e normaliza para minúsculas', () => {
    expect(validatePillar('SAUDE')).toBe('saude');
    expect(validatePillar('Projetos-Pessoais')).toBe('projetos-pessoais');
  });

  it('aceita "Saúde" com acento (grafia real em português) e normaliza para "saude"', () => {
    expect(validatePillar('Saúde')).toBe('saude');
    expect(validatePillar('SAÚDE')).toBe('saude');
    expect(validatePillar('saúde')).toBe('saude');
  });

  it('lança InvalidPillarError para um pilar fora da lista fixa', () => {
    expect(() => validatePillar('financeiro')).toThrow(InvalidPillarError);
  });

  it('a mensagem de erro lista os quatro valores válidos', () => {
    try {
      validatePillar('financeiro');
      expect.fail('deveria ter lançado InvalidPillarError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPillarError);
      for (const pillar of VALID_PILLARS) {
        expect((error as Error).message).toContain(pillar);
      }
    }
  });
});

function buildMockDocClient() {
  return { send: vi.fn().mockResolvedValue({}) };
}

describe('upsertPillarConfig', () => {
  it('envia um PutCommand com a chave, pilar e propósito corretos (Create)', async () => {
    const docClient = buildMockDocClient();

    await upsertPillarConfig(docClient, 'Reunião de time', 'profissional', 'Fechar Q4 no prazo');

    expect(docClient.send).toHaveBeenCalledTimes(1);
    const command = docClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Item: {
        calendar_event_pattern: 'Reunião de time',
        pillar: 'profissional',
        purpose: 'Fechar Q4 no prazo',
      },
    });
  });

  it('rodar de novo para o mesmo evento usa a mesma chave, sem criar item separado (Upsert)', async () => {
    const docClient = buildMockDocClient();

    await upsertPillarConfig(docClient, 'Reunião de time', 'profissional', 'Fechar Q4 no prazo');
    await upsertPillarConfig(docClient, 'Reunião de time', 'saude', 'Correr 3x por semana');

    expect(docClient.send).toHaveBeenCalledTimes(2);
    const [firstCommand, secondCommand] = docClient.send.mock.calls.map((call) => call[0]);

    expect(firstCommand.input.Item.calendar_event_pattern).toBe('Reunião de time');
    expect(secondCommand.input.Item.calendar_event_pattern).toBe('Reunião de time');
    expect(secondCommand.input.Item.pillar).toBe('saude');
    expect(secondCommand.input.Item.purpose).toBe('Correr 3x por semana');
    // Nenhum ConditionExpression (ex.: attribute_not_exists) é usado — PutItem
    // com a mesma chave sobrescreve em vez de rejeitar/duplicar (ver Design Notes).
    expect(firstCommand.input.ConditionExpression).toBeUndefined();
    expect(secondCommand.input.ConditionExpression).toBeUndefined();
  });
});
