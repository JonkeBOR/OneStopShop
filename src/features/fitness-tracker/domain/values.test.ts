import { describe, expect, it } from 'vitest';
import {
  formatKg,
  formatShortDate,
  gramsToKg,
  isNameTaken,
  localDate,
  nameKey,
  parseCompletedBlock,
  parseKgInput,
  parseLoggedReps,
  parseName,
  parseTargetReps,
  parseWeightKg,
  resolveTimeZone,
} from './values';

describe('parseWeightKg', () => {
  it('converts kilograms to whole grams', () => {
    expect(parseWeightKg(22.5)).toEqual({ ok: true, value: 22500 });
    expect(parseWeightKg(0.001)).toEqual({ ok: true, value: 1 });
    expect(parseWeightKg(1000)).toEqual({ ok: true, value: 1000000 });
  });

  it('does not drift on values that are not exact in binary', () => {
    expect(parseWeightKg(0.1 + 0.2)).toEqual({ ok: true, value: 300 });
    expect(parseWeightKg(62.35)).toEqual({ ok: true, value: 62350 });
  });

  it.each([0, -5, 1000.001, 1000.0005, 22.5001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s',
    (kilograms) => {
      expect(parseWeightKg(kilograms)).toEqual({ ok: false, error: 'invalid-weight' });
    },
  );
});

describe('gramsToKg', () => {
  it('converts whole grams back to kilograms', () => {
    expect(gramsToKg(22500)).toBe(22.5);
    expect(gramsToKg(1)).toBe(0.001);
  });
});

describe('parseTargetReps', () => {
  it.each([1, 12, 999])('accepts %s', (reps) => {
    expect(parseTargetReps(reps)).toEqual({ ok: true, value: reps });
  });

  it.each([0, -1, 12.5, 1000, Number.NaN])('rejects %s', (reps) => {
    expect(parseTargetReps(reps)).toEqual({ ok: false, error: 'invalid-target' });
  });
});

describe('parseLoggedReps', () => {
  it.each([1, 8, 999])('accepts %s', (reps) => {
    expect(parseLoggedReps(reps)).toEqual({ ok: true, value: reps });
  });

  it.each([0, -1, 8.5, 1000])('rejects %s', (reps) => {
    expect(parseLoggedReps(reps)).toEqual({ ok: false, error: 'invalid-reps' });
  });
});

describe('parseName', () => {
  it('trims surrounding spaces', () => {
    expect(parseName('  Incline bench press ')).toEqual({ ok: true, value: 'Incline bench press' });
  });

  it.each(['', '   ', '\t\n'])('requires a name for %j', (text) => {
    expect(parseName(text)).toEqual({ ok: false, error: 'name-required' });
  });

  it('accepts exactly 100 characters and rejects 101', () => {
    expect(parseName('a'.repeat(100)).ok).toBe(true);
    expect(parseName('a'.repeat(101))).toEqual({ ok: false, error: 'name-too-long' });
  });
});

describe('nameKey', () => {
  it('ignores letter case and surrounding spaces', () => {
    expect(nameKey('  Incline BENCH press ')).toBe('incline bench press');
    expect(nameKey('Squat')).toBe(nameKey(' squat'));
  });

  it('keeps inner spacing, so different words stay different', () => {
    expect(nameKey('bench press')).not.toBe(nameKey('benchpress'));
  });
});

describe('isNameTaken', () => {
  it('finds a name already used, ignoring letter case and surrounding spaces', () => {
    expect(isNameTaken(' upper LOWER ', ['5/3/1', 'Upper/Lower', 'Upper lower'])).toBe(true);
  });

  it('accepts a name nobody uses', () => {
    expect(isNameTaken('Full body', ['5/3/1', 'Upper lower'])).toBe(false);
    expect(isNameTaken('Full body', [])).toBe(false);
  });
});

describe('localDate', () => {
  const stockholm = 'Europe/Stockholm';

  it('gives the date in the given time zone, not in UTC', () => {
    const lateEvening = new Date('2026-10-02T21:30:00Z');
    expect(localDate(lateEvening, stockholm)).toEqual({ ok: true, value: '2026-10-02' });
    expect(localDate(lateEvening, 'UTC')).toEqual({ ok: true, value: '2026-10-02' });
  });

  it('rolls over at local midnight (23:30 then 00:10 in Stockholm)', () => {
    const beforeMidnight = new Date('2026-10-02T21:30:00Z');
    const afterMidnight = new Date('2026-10-02T22:10:00Z');
    expect(localDate(beforeMidnight, stockholm)).toEqual({ ok: true, value: '2026-10-02' });
    expect(localDate(afterMidnight, stockholm)).toEqual({ ok: true, value: '2026-10-03' });
  });

  it('rejects an unknown time zone', () => {
    expect(localDate(new Date(), 'Mars/Olympus')).toEqual({
      ok: false,
      error: 'invalid-time-zone',
    });
  });
});

describe('parseKgInput', () => {
  it('FR-009: accepts a point or a comma as the decimal separator', () => {
    expect(parseKgInput('61.25')).toEqual({ ok: true, value: 61.25 });
    expect(parseKgInput('61,25')).toEqual({ ok: true, value: 61.25 });
    expect(parseKgInput(' 67,5 ')).toEqual({ ok: true, value: 67.5 });
    expect(parseKgInput('80')).toEqual({ ok: true, value: 80 });
    expect(parseKgInput('.5')).toEqual({ ok: true, value: 0.5 });
  });

  it('treats empty input as no weight', () => {
    expect(parseKgInput('')).toEqual({ ok: true, value: null });
    expect(parseKgInput('   ')).toEqual({ ok: true, value: null });
  });

  it('FR-039: rejects more than two decimals, letters, signs and zero', () => {
    for (const text of ['61.255', '12,345', 'abc', '-5', '+5', '1e3', '5.', '1.2.3', '0', '0,00']) {
      expect(parseKgInput(text)).toEqual({ ok: false, error: 'invalid-weight' });
    }
  });

  it('rejects a weight the domain would refuse', () => {
    expect(parseKgInput('1000.01')).toEqual({ ok: false, error: 'invalid-weight' });
  });
});

describe('formatKg', () => {
  it('FR-009: shows at most two decimals and no trailing zeros', () => {
    expect(formatKg(62.5)).toBe('62.5');
    expect(formatKg(60)).toBe('60');
    expect(formatKg(61.25)).toBe('61.25');
    expect(formatKg(0.1 + 0.2)).toBe('0.3');
    expect(formatKg(74.2)).toBe('74.2');
  });
});

describe('resolveTimeZone', () => {
  it('R10: keeps a valid IANA time zone', () => {
    expect(resolveTimeZone('Europe/Stockholm')).toBe('Europe/Stockholm');
  });

  it('R10: decodes a percent-encoded time zone', () => {
    expect(resolveTimeZone('Europe%2FStockholm')).toBe('Europe/Stockholm');
  });

  it('R10: falls back to UTC when the value is missing, unknown or malformed', () => {
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(resolveTimeZone('')).toBe('UTC');
    expect(resolveTimeZone('Mars/Olympus')).toBe('UTC');
    expect(resolveTimeZone('%E0%A4%A')).toBe('UTC');
  });
});

describe('formatShortDate', () => {
  const lateEvening = new Date('2026-10-01T22:30:00Z');

  it('FR-013: shows the day and month in the given time zone', () => {
    expect(formatShortDate(lateEvening, 'UTC')).toBe('1 Oct');
    expect(formatShortDate(lateEvening, 'Europe/Stockholm')).toBe('2 Oct');
  });

  it('falls back to UTC for an unknown time zone', () => {
    expect(formatShortDate(lateEvening, 'Mars/Olympus')).toBe('1 Oct');
  });
});

describe('parseCompletedBlock', () => {
  it('reads a positive whole block number', () => {
    expect(parseCompletedBlock('3')).toBe(3);
  });

  it.each([undefined, '', '0', '-1', '1.5', 'two'])('ignores %j', (value) => {
    expect(parseCompletedBlock(value)).toBeNull();
  });
});
