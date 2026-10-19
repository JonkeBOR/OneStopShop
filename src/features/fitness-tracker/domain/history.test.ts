import { describe, expect, it } from 'vitest';
import { groupByBlockAcrossPasses } from './history';
import type { SetLog } from './types';

function setLog(overrides: {
  id: string;
  blockId: string;
  blockNumber: number;
  pass: number;
  performedAt: string;
  reps: number;
  weightKg: number | null;
}): SetLog {
  return {
    id: overrides.id,
    exerciseId: 'e1',
    performedAt: new Date(overrides.performedAt),
    setNumber: 1,
    reps: overrides.reps,
    weightKg: overrides.weightKg,
    variantId: null,
    context: {
      programId: 'p',
      cycleId: `c${overrides.pass}`,
      pass: overrides.pass,
      trainingBlockId: overrides.blockId,
      blockNumber: overrides.blockNumber,
      workoutId: 'w',
      exerciseSlotId: 's',
      workoutSessionId: 'ws',
    },
  };
}

describe('groupByBlockAcrossPasses', () => {
  const logs = [
    setLog({
      id: 'a',
      blockId: 'b1',
      blockNumber: 1,
      pass: 1,
      performedAt: '2026-01-01T10:00:00Z',
      reps: 10,
      weightKg: 50,
    }),
    setLog({
      id: 'b',
      blockId: 'b1',
      blockNumber: 1,
      pass: 1,
      performedAt: '2026-01-01T10:05:00Z',
      reps: 10,
      weightKg: 52.5,
    }),
    setLog({
      id: 'c',
      blockId: 'b2',
      blockNumber: 2,
      pass: 1,
      performedAt: '2026-01-08T10:00:00Z',
      reps: 8,
      weightKg: 55,
    }),
    setLog({
      id: 'd',
      blockId: 'b1',
      blockNumber: 1,
      pass: 2,
      performedAt: '2026-02-01T10:00:00Z',
      reps: 10,
      weightKg: 55,
    }),
  ];

  it('FR-035: groups by block, then by cycle, ordered by time', () => {
    const groups = groupByBlockAcrossPasses([...logs].reverse());

    expect(groups.map((group) => [group.trainingBlockId, group.blockNumber])).toEqual([
      ['b1', 1],
      ['b2', 2],
    ]);
    expect(groups[0]?.passes.map((entry) => entry.pass)).toEqual([1, 2]);
    expect(groups[0]?.passes[0]?.setLogs.map((log) => log.id)).toEqual(['a', 'b']);
  });

  it('FR-035: gives sets, total reps and volume for each block in each cycle', () => {
    const [firstBlock] = groupByBlockAcrossPasses(logs);

    expect(firstBlock?.passes[0]).toMatchObject({ sets: 2, totalReps: 20, volumeKg: 1025 });
    expect(firstBlock?.passes[1]).toMatchObject({ sets: 1, totalReps: 10, volumeKg: 550 });
  });

  it('counts a set without weight as sets and reps but adds no volume', () => {
    const [group] = groupByBlockAcrossPasses([
      setLog({
        id: 'x',
        blockId: 'b1',
        blockNumber: 1,
        pass: 1,
        performedAt: '2026-01-01T10:00:00Z',
        reps: 8,
        weightKg: null,
      }),
    ]);

    expect(group?.passes[0]).toMatchObject({ sets: 1, totalReps: 8, volumeKg: 0 });
  });

  it('has no groups for no set logs', () => {
    expect(groupByBlockAcrossPasses([])).toEqual([]);
  });
});
