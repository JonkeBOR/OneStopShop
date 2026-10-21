import type { BodyweightEntry, ExerciseVariant, SetLog } from './types';
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

export const noVariantParam = 'none';

export const programBandColorCount = 4;

const MAX_ESTIMATE_REPS = 12;
const EPLEY_DIVISOR = 30;

export type ProgramSession = {
  programId: string;
  programName: string;
  isDeleted: boolean;
  startedAt: Date;
};

export type ProgramBand = {
  from: number;
  to: number;
  programId: string;
  name: string;
  isDeleted: boolean;
  colorIndex: number;
};

export type LegendEntry = {
  programId: string;
  name: string;
  isDeleted: boolean;
  colorIndex: number;
};

export type SeriesChip = { param: string; variantName: string | null; isSelected: boolean };

export type OneRepMaxChart = {
  range: ChartRange;
  domain: ChartDomain;
  chips: SeriesChip[];
  selectedParam: string | null;
  points: ChartPoint[];
  bands: ProgramBand[];
  legend: LegendEntry[];
};

type OneRepMaxChartInput = {
  setLogs: readonly SetLog[];
  variants: readonly ExerciseVariant[];
  sessions: readonly ProgramSession[];
  today: string;
  timeZone: string;
  range: ChartRange;
  requestedVariant: string | undefined;
};

type Series = { param: string; points: ChartPoint[] };

export function estimatedOneRepMaxKg(reps: number, weightKg: number | null): number | null {
  if (weightKg === null || reps < 1 || reps > MAX_ESTIMATE_REPS) {
    return null;
  }
  return reps === 1 ? weightKg : weightKg * (1 + reps / EPLEY_DIVISOR);
}

export function variantParam(variantId: string | null): string {
  return variantId ?? noVariantParam;
}

function seriesFromLogs(
  setLogs: readonly SetLog[],
  timeZone: string,
  start: string | null,
): Series[] {
  const bestBySession = new Map<string, Map<string, { kg: number; day: string }>>();
  for (const log of setLogs) {
    const kg = estimatedOneRepMaxKg(log.reps, log.weightKg);
    if (kg === null) {
      continue;
    }
    const param = variantParam(log.variantId);
    const sessions = bestBySession.get(param) ?? new Map<string, { kg: number; day: string }>();
    const best = sessions.get(log.context.workoutSessionId);
    if (best === undefined || kg > best.kg) {
      sessions.set(log.context.workoutSessionId, { kg, day: localDay(log.performedAt, timeZone) });
    }
    bestBySession.set(param, sessions);
  }
  return [...bestBySession.entries()]
    .map(([param, sessions]) => ({
      param,
      points: [...sessions.values()]
        .filter((best) => start === null || best.day >= start)
        .toSorted((a, b) => a.day.localeCompare(b.day))
        .map((best) => ({ time: chartTime(best.day), kg: best.kg })),
    }))
    .filter((series) => series.points.length > 0);
}

function lastTime(series: Series): number {
  return series.points[series.points.length - 1]?.time ?? 0;
}

function programRuns(
  sessions: readonly ProgramSession[],
): { first: ProgramSession; lastStartedAt: Date }[] {
  const runs: { first: ProgramSession; lastStartedAt: Date }[] = [];
  for (const session of sessions.toSorted(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  )) {
    const run = runs[runs.length - 1];
    if (run !== undefined && run.first.programId === session.programId) {
      run.lastStartedAt = session.startedAt;
    } else {
      runs.push({ first: session, lastStartedAt: session.startedAt });
    }
  }
  return runs;
}

function programBands(
  sessions: readonly ProgramSession[],
  timeZone: string,
  start: string | null,
): ProgramBand[] {
  const colorIndexes = new Map<string, number>();
  const startTime = start === null ? null : dayStart(start);
  const bands: ProgramBand[] = [];
  for (const run of programRuns(sessions)) {
    const { programId } = run.first;
    if (!colorIndexes.has(programId)) {
      colorIndexes.set(programId, colorIndexes.size % programBandColorCount);
    }
    const from = dayStart(localDay(run.first.startedAt, timeZone));
    const to = dayStart(localDay(run.lastStartedAt, timeZone)) + DAY_MS;
    if (startTime === null || to > startTime) {
      bands.push({
        from: startTime === null ? from : Math.max(from, startTime),
        to,
        programId,
        name: run.first.programName,
        isDeleted: run.first.isDeleted,
        colorIndex: colorIndexes.get(programId) ?? 0,
      });
    }
  }
  return bands;
}

function legendFromBands(bands: readonly ProgramBand[]): LegendEntry[] {
  const legend = new Map<string, LegendEntry>();
  for (const band of bands) {
    if (!legend.has(band.programId)) {
      legend.set(band.programId, {
        programId: band.programId,
        name: band.name,
        isDeleted: band.isDeleted,
        colorIndex: band.colorIndex,
      });
    }
  }
  return [...legend.values()];
}

export function oneRepMaxChart(input: OneRepMaxChartInput): OneRepMaxChart {
  const { today, timeZone, range } = input;
  const start = rangeStartDate(today, range);
  const variantNames = new Map(input.variants.map((variant) => [variant.id, variant.name]));
  const series = seriesFromLogs(input.setLogs, timeZone, start)
    .filter((candidate) => candidate.param === noVariantParam || variantNames.has(candidate.param))
    .toSorted((a, b) => lastTime(b) - lastTime(a));
  const selected =
    series.find((candidate) => candidate.param === input.requestedVariant) ?? series[0];
  const points = selected?.points ?? [];
  const bands = programBands(input.sessions, timeZone, start);
  const earliest = Math.min(
    ...points.map((point) => point.time - HALF_DAY_MS),
    ...bands.map((band) => band.from),
  );
  const domainStart = start === null ? Math.min(earliest, dayStart(today)) : dayStart(start);
  return {
    range,
    domain: [domainStart, dayStart(today) + DAY_MS],
    chips:
      series.length < 2
        ? []
        : series.map((candidate) => ({
            param: candidate.param,
            variantName: variantNames.get(candidate.param) ?? null,
            isSelected: candidate === selected,
          })),
    selectedParam: selected?.param ?? null,
    points,
    bands,
    legend: legendFromBands(bands),
  };
}

export function formatChartDate(time: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(time);
}
