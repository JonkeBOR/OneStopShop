import { describe, expect, test } from 'vitest';
import { todayInTimeZone } from './today';

describe('todayInTimeZone', () => {
  test('returns the configured zone’s day even when it differs from the UTC day', () => {
    const lateUtcMoment = new Date('2026-01-15T23:30:00.000Z');

    expect(todayInTimeZone(lateUtcMoment, 'Pacific/Auckland')).toBe('2026-01-16');
    expect(todayInTimeZone(lateUtcMoment, 'America/Los_Angeles')).toBe('2026-01-15');
  });

  test('formats as YYYY-MM-DD', () => {
    expect(todayInTimeZone(new Date('2026-03-05T12:00:00.000Z'), 'UTC')).toBe('2026-03-05');
  });
});
