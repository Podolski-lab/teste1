import { describe, expect, it } from 'vitest';

import { nextCalendarDate, zonedTimeToUtc } from '../../src/infra/googleCalendarClient';

describe('zonedTimeToUtc', () => {
  it('converts a non-DST date in UTC correctly (no offset to apply)', () => {
    const result = zonedTimeToUtc('2026-09-25T00:00:00', 'UTC');

    expect(result.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('converts a non-DST date in America/Sao_Paulo correctly (fixed UTC-3)', () => {
    const result = zonedTimeToUtc('2026-09-25T00:00:00', 'America/Sao_Paulo');

    expect(result.toISOString()).toBe('2026-09-25T03:00:00.000Z');
  });

  it('converts a date straddling the America/New_York spring-forward DST transition correctly', () => {
    // 2026-03-08: DST begins in America/New_York (clocks jump 2am -> 3am, EST -> EDT).
    const beforeTransition = zonedTimeToUtc('2026-03-08T00:00:00', 'America/New_York');
    const afterTransition = zonedTimeToUtc('2026-03-08T03:00:00', 'America/New_York');

    // Before the transition, still EST (UTC-5).
    expect(beforeTransition.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    // After the transition, already EDT (UTC-4).
    expect(afterTransition.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('converts a date straddling the America/New_York fall-back DST transition correctly', () => {
    // 2026-11-01: DST ends in America/New_York (clocks fall back 2am -> 1am, EDT -> EST).
    const beforeTransition = zonedTimeToUtc('2026-11-01T00:00:00', 'America/New_York');
    const afterTransition = zonedTimeToUtc('2026-11-01T03:00:00', 'America/New_York');

    // Before the transition, still EDT (UTC-4).
    expect(beforeTransition.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    // After the transition, already EST (UTC-5).
    expect(afterTransition.toISOString()).toBe('2026-11-01T08:00:00.000Z');
  });
});

describe('nextCalendarDate', () => {
  it('rolls over across a plain day boundary', () => {
    expect(nextCalendarDate('2026-09-25')).toBe('2026-09-26');
  });

  it('rolls over across a month boundary', () => {
    expect(nextCalendarDate('2026-01-31')).toBe('2026-02-01');
  });

  it('rolls over across a year boundary', () => {
    expect(nextCalendarDate('2026-12-31')).toBe('2027-01-01');
  });
});
