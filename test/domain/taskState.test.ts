import { describe, expect, it } from 'vitest';

import { buildReminderSpeech, isReminderDue, PILLAR_DISPLAY_LABELS } from '../../src/domain/taskState';
import { INITIAL_TASK_STATUS, REMINDER_SENT_STATUS, TaskInstance } from '../../src/domain/taskDetection';

function buildTaskInstance(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    task_id: 'evt-123#2026-09-25',
    calendar_event_id: 'evt-123',
    date: '2026-09-25',
    pillar: 'saude',
    purpose: 'chegar na meta de dezembro',
    task_title: 'Correr no parque',
    status: INITIAL_TASK_STATUS,
    checkpoint_attempts: 0,
    reminder_at: '2026-09-25T14:00:00-03:00',
    checkpoint_at: '2026-09-25T15:00:00-03:00',
    ...overrides,
  };
}

describe('isReminderDue', () => {
  it('Reminder due: pendente task whose reminder_at already arrived is due', () => {
    const task = buildTaskInstance({ reminder_at: '2026-09-25T14:00:00-03:00' });

    expect(isReminderDue(task, '2026-09-25T17:00:00Z')).toBe(true);
  });

  it('is due exactly at reminder_at (inclusive boundary)', () => {
    const task = buildTaskInstance({ reminder_at: '2026-09-25T14:00:00-03:00' });

    expect(isReminderDue(task, '2026-09-25T17:00:00Z')).toBe(true);
  });

  it('is not due before reminder_at, even comparing across differing ISO offsets', () => {
    const task = buildTaskInstance({ reminder_at: '2026-09-25T14:00:00-03:00' });

    // 16:59 UTC == 13:59 -03:00, one minute before reminder_at.
    expect(isReminderDue(task, '2026-09-25T16:59:00Z')).toBe(false);
  });

  it('Already sent (retry): a task whose status is no longer pendente is never due, regardless of time', () => {
    const task = buildTaskInstance({
      status: REMINDER_SENT_STATUS,
      reminder_at: '2020-01-01T00:00:00-03:00',
    });

    expect(isReminderDue(task, '2026-09-25T17:00:00Z')).toBe(false);
  });
});

describe('buildReminderSpeech', () => {
  it('reconnects the reminder to pillar and purpose, never the raw task_title', () => {
    const task = buildTaskInstance({
      pillar: 'saude',
      purpose: 'chegar na meta de dezembro',
      task_title: 'Correr no parque',
    });

    const speech = buildReminderSpeech(task);

    expect(speech).toContain(PILLAR_DISPLAY_LABELS.saude);
    expect(speech).toContain('chegar na meta de dezembro');
    expect(speech).not.toContain('Correr no parque');
  });

  it('follows the exact EXPERIENCE.md phrase template', () => {
    const task = buildTaskInstance({
      pillar: 'projetos-pessoais',
      purpose: 'conseguir uma renda extra no futuro próximo',
    });

    expect(buildReminderSpeech(task)).toBe(
      'Olá Lucas, vamos trabalhar nas tarefas de Projetos Pessoais que você programou ' +
        'pra hoje? Isso vai te ajudar a conseguir uma renda extra no futuro próximo.'
    );
  });

  it.each([
    ['saude', 'Saúde'],
    ['profissional', 'Profissional'],
    ['projetos-pessoais', 'Projetos Pessoais'],
    ['lazer', 'Lazer'],
  ])('maps pillar slug %s to natural-speech label %s', (pillar, label) => {
    const task = buildTaskInstance({ pillar });

    expect(buildReminderSpeech(task)).toContain(label);
  });

  it('falls back to the raw pillar value for an unmapped pillar, instead of throwing', () => {
    const task = buildTaskInstance({ pillar: 'algum-pilar-novo' });

    expect(() => buildReminderSpeech(task)).not.toThrow();
    expect(buildReminderSpeech(task)).toContain('algum-pilar-novo');
  });
});
