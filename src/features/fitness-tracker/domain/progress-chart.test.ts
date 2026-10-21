import { describe, expect, it } from 'vitest';
import {
  bodyweightChart,
  chartTime,
  dayStart,
  formatChartDate,
  localDay,
  parseChartRange,
  rangeStartDate,
} from './progress-chart';

const DAY = 86_400_000;

describe('parseChartRange', () => {
  it('accepts known ranges and defaults to three months', () => {
    expect(parseChartRange('1y')).toBe('1y');
    expect(parseChartRange('all')).toBe('all');
    expect(parseChartRange(undefined)).toBe('3m');
    expect(parseChartRange('week')).toBe('3m');
  });
});

describe('rangeStartDate', () => {
  it('subtracts calendar months and clamps to the end of the month', () => {
    expect(rangeStartDate('2026-10-21', '3m')).toBe('2026-07-21');
    expect(rangeStartDate('2026-10-21', '1y')).toBe('2025-10-21');
    expect(rangeStartDate('2026-05-31', '3m')).toBe('2026-02-28');
    expect(rangeStartDate('2028-02-29', '1y')).toBe('2027-02-28');
  });

  it('has no start for everything', () => {
    expect(rangeStartDate('2026-10-21', 'all')).toBeNull();
  });
});

describe('time axis', () => {
  it('places a day at local noon on a UTC-encoded axis', () => {
    expect(dayStart('2026-10-21')).toBe(Date.parse('2026-10-21T00:00:00.000Z'));
    expect(chartTime('2026-10-21')).toBe(Date.parse('2026-10-21T12:00:00.000Z'));
  });

  it('turns an instant into a local date, falling back to UTC', () => {
    const instant = new Date('2026-10-21T23:30:00Z');
    expect(localDay(instant, 'Europe/Oslo')).toBe('2026-10-22');
    expect(localDay(instant, 'Not/AZone')).toBe('2026-10-21');
  });

  it('formats a chart time as a short date', () => {
    expect(formatChartDate(chartTime('2026-10-21'))).toBe('21 Oct');
  });
});

describe('bodyweightChart', () => {
  const entries = [
    { id: 'c', date: '2026-10-01', weightKg: 80 },
    { id: 'a', date: '2026-07-20', weightKg: 82 },
    { id: 'b', date: '2026-07-21', weightKg: 81 },
  ];

  it('keeps entries from the range start in date order', () => {
    const chart = bodyweightChart(entries, '2026-10-21', '3m');
    expect(chart.range).toBe('3m');
    expect(chart.points).toEqual([
      { time: chartTime('2026-07-21'), kg: 81 },
      { time: chartTime('2026-10-01'), kg: 80 },
    ]);
    expect(chart.domain).toEqual([dayStart('2026-07-21'), dayStart('2026-10-21') + DAY]);
  });

  it('starts everything at the first entry', () => {
    const chart = bodyweightChart(entries, '2026-10-21', 'all');
    expect(chart.points).toHaveLength(3);
    expect(chart.domain).toEqual([dayStart('2026-07-20'), dayStart('2026-10-21') + DAY]);
  });

  it('starts everything at today when there are no entries', () => {
    expect(bodyweightChart([], '2026-10-21', 'all')).toEqual({
      range: 'all',
      domain: [dayStart('2026-10-21'), dayStart('2026-10-21') + DAY],
      points: [],
    });
  });
});
