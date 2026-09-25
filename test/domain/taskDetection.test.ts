import { describe, expect, it } from 'vitest';

import {
  buildTaskInstanceIfMatched,
  CalendarEvent,
  INITIAL_TASK_STATUS,
  PillarConfigEntry,
} from '../../src/domain/taskDetection';

const TODAY = '2026-09-25';

function buildTimedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-123',
    summary: 'Correr no parque',
    start: { dateTime: '2026-09-25T14:00:00-03:00' },
    end: { dateTime: '2026-09-25T15:00:00-03:00' },
    ...overrides,
  };
}

function buildPillarConfig(overrides: Partial<PillarConfigEntry> = {}): PillarConfigEntry {
  return {
    pillar: 'saude',
    purpose: 'chegar na meta de dezembro',
    ...overrides,
  };
}

describe('buildTaskInstanceIfMatched', () => {
  it('Matched task: timed event + PillarConfig match -> TaskInstance congelada, status pendente', () => {
    const event = buildTimedEvent();
    const pillarConfig = buildPillarConfig();

    const result = buildTaskInstanceIfMatched(event, pillarConfig, TODAY);

    expect(result).toEqual({
      task_id: 'evt-123#2026-09-25',
      calendar_event_id: 'evt-123',
      date: TODAY,
      pillar: 'saude',
      purpose: 'chegar na meta de dezembro',
      task_title: 'Correr no parque',
      status: INITIAL_TASK_STATUS,
      checkpoint_attempts: 0,
      reminder_at: '2026-09-25T14:00:00-03:00',
      checkpoint_at: '2026-09-25T15:00:00-03:00',
    });
  });

  it('No match: timed event with no PillarConfig entry -> undefined (no TaskInstance)', () => {
    const event = buildTimedEvent();

    const result = buildTaskInstanceIfMatched(event, undefined, TODAY);

    expect(result).toBeUndefined();
  });

  it('Re-poll: same inputs build the exact same task_id, so the repository can no-op on it', () => {
    const event = buildTimedEvent();
    const pillarConfig = buildPillarConfig();

    const first = buildTaskInstanceIfMatched(event, pillarConfig, TODAY);
    const second = buildTaskInstanceIfMatched(event, pillarConfig, TODAY);

    expect(first).toEqual(second);
    expect(first?.task_id).toBe('evt-123#2026-09-25');
  });

  it('All-day event: start has only `date`, no `dateTime` -> undefined (skipped)', () => {
    const event = buildTimedEvent({
      start: { date: '2026-09-25' },
      end: { date: '2026-09-26' },
    });
    const pillarConfig = buildPillarConfig();

    const result = buildTaskInstanceIfMatched(event, pillarConfig, TODAY);

    expect(result).toBeUndefined();
  });

  it('freezes pillar/purpose/task_title from the arguments, not re-derived from anything else', () => {
    const event = buildTimedEvent({ summary: 'Reunião de time' });
    const pillarConfig = buildPillarConfig({ pillar: 'profissional', purpose: 'Fechar Q4 no prazo' });

    const result = buildTaskInstanceIfMatched(event, pillarConfig, TODAY);

    expect(result?.pillar).toBe('profissional');
    expect(result?.purpose).toBe('Fechar Q4 no prazo');
    expect(result?.task_title).toBe('Reunião de time');
  });
});
