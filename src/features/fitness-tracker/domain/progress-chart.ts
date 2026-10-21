import type { BodyweightEntry } from './types';
import { localDate } from './values';

export const chartRanges = ['3m', '1y', 'all'] as const;

export type ChartRange = (typeof chartRanges)[number];

export type ChartPoint = { time: number; kg: number };

export type ChartDomain = [number, number];

export type BodyweightChart = { range: ChartRange; domain: ChartDomain; points: ChartPoint[] };

const DAY_MS = 86_400_000;
const HALF_DAY_MS = 43_200_000;
const MONTHS_BY_RANGE = { '3m': 3, '1y': 12 } as const;

export function parseChartRange(value: string | undefined): ChartRange {
  return chartRanges.find((range) => range === value) ?? '3m';
}

export function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function chartTime(date: string): number {
  return dayStart(date) + HALF_DAY_MS;
}

export function localDay(instant: Date, timeZone: string): string {
  const local = localDate(instant, timeZone);
  return local.ok ? local.value : instant.toISOString().slice(0, 10);
}

export function rangeStartDate(today: string, range: ChartRange): string | null {
  if (range === 'all') {
    return null;
  }
  const base = new Date(dayStart(today));
  const day = base.getUTCDate();
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - MONTHS_BY_RANGE[range], 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function bodyweightChart(
  entries: readonly BodyweightEntry[],
  today: string,
  range: ChartRange,
): BodyweightChart {
  const start = rangeStartDate(today, range);
  const kept = entries
    .filter((entry) => start === null || entry.date >= start)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  const domainStart = start ?? kept[0]?.date ?? today;
  return {
    range,
    domain: [dayStart(domainStart), dayStart(today) + DAY_MS],
    points: kept.map((entry) => ({ time: chartTime(entry.date), kg: entry.weightKg })),
  };
}

export function formatChartDate(time: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(time);
}
