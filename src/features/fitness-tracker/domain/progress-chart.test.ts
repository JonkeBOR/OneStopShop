import { describe, expect, it } from 'vitest';
import {
  bodyweightChart,
  chartTime,
  dayStart,
  estimatedOneRepMaxKg,
  formatChartDate,
  localDay,
  oneRepMaxChart,
  parseChartRange,
  rangeStartDate,
} from './progress-chart';
import type { ProgramSession } from './progress-chart';
import type { SetLog } from './types';

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

describe('estimatedOneRepMaxKg', () => {
  it('estimates from reps and weight, and rejects what it cannot estimate', () => {
    expect(estimatedOneRepMaxKg(12, 60)).toBe(84);
    expect(estimatedOneRepMaxKg(10, 62.5)).toBeCloseTo(83.333);
    expect(estimatedOneRepMaxKg(8, 65)).toBeCloseTo(82.333);
    expect(estimatedOneRepMaxKg(1, 100)).toBe(100);
    expect(estimatedOneRepMaxKg(13, 60)).toBeNull();
    expect(estimatedOneRepMaxKg(0, 60)).toBeNull();
    expect(estimatedOneRepMaxKg(5, null)).toBeNull();
  });
});

let logCounter = 0;

function setLog(overrides: {
  day: string;
  reps: number;
  weightKg: number | null;
  variantId?: string | null;
  sessionId?: string;
  slotId?: string;
}): SetLog {
  logCounter += 1;
  return {
    id: `log-${logCounter}`,
    exerciseId: 'exercise',
    performedAt: new Date(`${overrides.day}T10:00:00Z`),
    setNumber: 1,
    reps: overrides.reps,
    weightKg: overrides.weightKg,
    variantId: overrides.variantId ?? null,
    context: {
      programId: 'p',
      cycleId: 'c',
      pass: 1,
      trainingBlockId: 'b',
      blockNumber: 1,
      workoutId: 'w',
      exerciseSlotId: overrides.slotId ?? 'slot',
      workoutSessionId: overrides.sessionId ?? `session-${overrides.day}`,
    },
  };
}

function chartFor(
  setLogs: SetLog[],
  extra: {
    range?: '3m' | '1y' | 'all';
    requestedVariant?: string;
    sessions?: ProgramSession[];
  } = {},
) {
  return oneRepMaxChart({
    setLogs,
    variants: [
      { id: 'a', name: 'Gym A' },
      { id: 'b', name: 'Gym B' },
    ],
    sessions: extra.sessions ?? [],
    today: '2026-10-21',
    timeZone: 'UTC',
    range: extra.range ?? '3m',
    requestedVariant: extra.requestedVariant,
  });
}

describe('oneRepMaxChart', () => {
  it("picks each session's best estimated set, not its heaviest", () => {
    const chart = chartFor([
      setLog({ day: '2026-10-01', reps: 12, weightKg: 60, sessionId: 's' }),
      setLog({ day: '2026-10-01', reps: 10, weightKg: 62.5, sessionId: 's' }),
      setLog({ day: '2026-10-01', reps: 8, weightKg: 65, sessionId: 's' }),
    ]);
    expect(chart.points).toEqual([{ time: chartTime('2026-10-01'), kg: 84 }]);
  });

  it('gives one point for a session that logged the exercise in two slots', () => {
    const chart = chartFor([
      setLog({ day: '2026-10-01', reps: 5, weightKg: 80, sessionId: 's', slotId: 'one' }),
      setLog({ day: '2026-10-01', reps: 5, weightKg: 90, sessionId: 's', slotId: 'two' }),
    ]);
    expect(chart.points).toEqual([{ time: chartTime('2026-10-01'), kg: 90 * (1 + 5 / 30) }]);
  });

  it('keeps variants apart and lists chips by most recent point', () => {
    const chart = chartFor([
      setLog({ day: '2026-10-01', reps: 5, weightKg: 80, variantId: 'a' }),
      setLog({ day: '2026-10-10', reps: 5, weightKg: 80, variantId: 'b' }),
      setLog({ day: '2026-10-05', reps: 5, weightKg: 80 }),
    ]);
    expect(chart.chips.map((chip) => chip.param)).toEqual(['b', 'none', 'a']);
    expect(chart.chips.map((chip) => chip.variantName)).toEqual(['Gym B', null, 'Gym A']);
    expect(chart.selectedParam).toBe('b');
    expect(chart.chips.map((chip) => chip.isSelected)).toEqual([true, false, false]);
  });

  it('selects the requested variant when it has points', () => {
    const chart = chartFor(
      [
        setLog({ day: '2026-10-01', reps: 5, weightKg: 80, variantId: 'a' }),
        setLog({ day: '2026-10-10', reps: 5, weightKg: 80, variantId: 'b' }),
      ],
      { requestedVariant: 'a' },
    );
    expect(chart.selectedParam).toBe('a');
  });

  it('falls back to the most recent series when the requested variant has no points in range', () => {
    const logs = [
      setLog({ day: '2025-01-01', reps: 5, weightKg: 80, variantId: 'a' }),
      setLog({ day: '2026-10-10', reps: 5, weightKg: 80, variantId: 'b' }),
      setLog({ day: '2026-10-11', reps: 5, weightKg: 80 }),
    ];
    expect(chartFor(logs, { requestedVariant: 'nonsense' }).selectedParam).toBe('none');
    expect(chartFor(logs, { requestedVariant: 'a' }).selectedParam).toBe('none');
  });

  it('shows no chips for a single series and no points when nothing qualifies', () => {
    const single = chartFor([setLog({ day: '2026-10-10', reps: 5, weightKg: 80 })]);
    expect(single.chips).toEqual([]);
    expect(single.selectedParam).toBe('none');
    const none = chartFor([
      setLog({ day: '2026-10-10', reps: 15, weightKg: 40 }),
      setLog({ day: '2026-10-11', reps: 5, weightKg: null }),
    ]);
    expect(none.chips).toEqual([]);
    expect(none.selectedParam).toBeNull();
    expect(none.points).toEqual([]);
  });

  it('drops a series whose variant is unknown', () => {
    const chart = chartFor([
      setLog({ day: '2026-10-10', reps: 5, weightKg: 80, variantId: 'gone' }),
      setLog({ day: '2026-10-09', reps: 5, weightKg: 80, variantId: 'a' }),
    ]);
    expect(chart.chips).toEqual([]);
    expect(chart.selectedParam).toBe('a');
  });
});

describe('oneRepMaxChart program bands', () => {
  const session = (programId: string, day: string): ProgramSession => ({
    programId,
    programName: `Program ${programId}`,
    isDeleted: false,
    startedAt: new Date(`${day}T10:00:00Z`),
  });
  const sessions = [
    session('A', '2026-06-01'),
    session('A', '2026-07-25'),
    session('B', '2026-08-01'),
    session('A', '2026-09-01'),
  ];

  it('merges consecutive sessions, gives a returning program its colour back, and ignores the range for colours', () => {
    const all = chartFor([], { range: 'all', sessions });
    expect(all.bands.map((band) => band.colorIndex)).toEqual([0, 1, 0]);
    expect(all.bands[0]).toMatchObject({
      from: dayStart('2026-06-01'),
      to: dayStart('2026-07-25') + DAY,
      programId: 'A',
      name: 'Program A',
    });
    expect(all.legend.map((entry) => entry.programId)).toEqual(['A', 'B']);

    const ranged = chartFor([], { range: '3m', sessions });
    expect(ranged.bands).toHaveLength(3);
    expect(ranged.bands[0]?.from).toBe(dayStart('2026-07-21'));
    expect(ranged.bands[1]?.colorIndex).toBe(1);

    const dropped = chartFor([], {
      range: '3m',
      sessions: [session('A', '2026-01-01'), session('B', '2026-08-01')],
    });
    expect(dropped.bands).toHaveLength(1);
    expect(dropped.bands[0]?.colorIndex).toBe(1);
    expect(dropped.legend.map((entry) => entry.programId)).toEqual(['B']);
  });

  it('marks deleted programs', () => {
    const chart = chartFor([], {
      range: 'all',
      sessions: [{ ...session('A', '2026-08-01'), isDeleted: true }],
    });
    expect(chart.bands[0]).toMatchObject({ isDeleted: true, name: 'Program A' });
    expect(chart.legend[0]).toMatchObject({ isDeleted: true, name: 'Program A' });
  });

  it('makes a single-session run one day wide', () => {
    const chart = chartFor([], { range: 'all', sessions: [session('A', '2026-08-01')] });
    const band = chart.bands[0];
    expect((band?.to ?? 0) - (band?.from ?? 0)).toBe(DAY);
  });

  it('starts everything at the earliest of the points and the bands', () => {
    const chart = chartFor([setLog({ day: '2026-09-15', reps: 5, weightKg: 80 })], {
      range: 'all',
      sessions,
    });
    expect(chart.domain).toEqual([dayStart('2026-06-01'), dayStart('2026-10-21') + DAY]);
    const empty = chartFor([], { range: 'all' });
    expect(empty.domain).toEqual([dayStart('2026-10-21'), dayStart('2026-10-21') + DAY]);
  });
});
