import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_JSON_PATH = join(__dirname, '..', 'skill-package', 'skill.json');
const INTERACTION_MODEL_PATH = join(
  __dirname,
  '..',
  'skill-package',
  'interactionModels',
  'custom',
  'pt-BR.json'
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('skill-package/skill.json', () => {
  it('is valid JSON', () => {
    expect(() => readJson(SKILL_JSON_PATH)).not.toThrow();
  });
});

describe('skill-package/interactionModels/custom/pt-BR.json', () => {
  it('is valid JSON', () => {
    expect(() => readJson(INTERACTION_MODEL_PATH)).not.toThrow();
  });

  it('has the expected invocation name and built-in intents', () => {
    const interactionModel = readJson(INTERACTION_MODEL_PATH) as {
      interactionModel: {
        languageModel: {
          invocationName: string;
          intents: Array<{ name: string }>;
        };
      };
    };

    const { languageModel } = interactionModel.interactionModel;

    expect(languageModel.invocationName).toBe('assistente pessoal');

    const intentNames = languageModel.intents.map((intent) => intent.name);
    expect(intentNames).toEqual(
      expect.arrayContaining([
        'AMAZON.CancelIntent',
        'AMAZON.StopIntent',
        'AMAZON.HelpIntent',
        'AMAZON.FallbackIntent',
      ])
    );
  });
});
