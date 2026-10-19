import { describe, expect, it } from 'vitest';
import { type BodyPartLink, bodyPartIds } from './body-part';
import type { SlotView, WorkoutView } from './types';
import { setWeights, volumeBands, volumeLevel, volumeLevels, weeklyVolume } from './volume';

function slot(
  exerciseId: string,
  setsByBlock: Record<string, number>,
  isOptional = false,
): SlotView {
  return {
    id: crypto.randomUUID(),
    exercise: { id: exerciseId, name: exerciseId, isArchived: false },
    isOptional,
    isPeriodized: true,
    prescriptions: Object.entries(setsByBlock).map(([blockId, sets]) => ({
      blockId,
      plannedSets: Array.from({ length: sets }, (_, index) => ({
        id: `${blockId}-${index + 1}`,
        setNumber: index + 1,
        targetReps: 10,
        lastWeightKg: null,
      })),
    })),
  };
}

function workout(...slots: SlotView[]): WorkoutView {
  return { id: crypto.randomUUID(), name: 'Workout', slots };
}

function links(entries: Record<string, BodyPartLink[]>): ReadonlyMap<string, BodyPartLink[]> {
  return new Map(Object.entries(entries));
}

const bench = slot('bench', { b1: 3, b2: 3, b3: 2 });
const benchLinks = links({
  bench: [
    { bodyPart: 'chest', role: 'primary' },
    { bodyPart: 'triceps', role: 'secondary' },
  ],
});

describe('weeklyVolume', () => {
  it('counts a primary set as 1 and a secondary set as 0.5', () => {
    const sets = weeklyVolume([workout(bench)], 'b1', benchLinks);

    expect(setWeights).toEqual({ primary: 1, secondary: 0.5 });
    expect(sets.chest).toBe(3);
    expect(sets.triceps).toBe(1.5);
    expect(sets.lats).toBe(0);
  });

  it('adds the sets of every workout', () => {
    const sets = weeklyVolume(
      [workout(bench), workout(slot('bench', { b1: 4 }))],
      'b1',
      benchLinks,
    );

    expect(sets.chest).toBe(7);
    expect(sets.triceps).toBe(3.5);
  });

  it('counts every slot when an exercise appears twice in one workout', () => {
    const sets = weeklyVolume([workout(bench, slot('bench', { b1: 2 }))], 'b1', benchLinks);

    expect(sets.chest).toBe(5);
  });

  it('leaves out optional slots', () => {
    const sets = weeklyVolume(
      [workout(bench, slot('curl', { b1: 3 }, true))],
      'b1',
      links({ curl: [{ bodyPart: 'biceps', role: 'primary' }] }),
    );

    expect(sets.biceps).toBe(0);
  });

  it("counts the chosen block's prescription", () => {
    expect(weeklyVolume([workout(bench)], 'b3', benchLinks).chest).toBe(2);
  });

  it('counts nothing for a slot with no prescription in the block', () => {
    const sets = weeklyVolume([workout(bench)], 'missing', benchLinks);

    expect(Object.values(sets).every((value) => value === 0)).toBe(true);
  });

  it('gives an unlinked exercise no volume and every body part a value', () => {
    const sets = weeklyVolume([workout(bench)], 'b1', new Map());

    expect(Object.keys(sets).toSorted()).toEqual([...bodyPartIds].toSorted());
    expect(Object.values(sets).every((value) => value === 0)).toBe(true);
  });
});

describe('volumeLevel', () => {
  it.each([
    [0, 'none'],
    [0.5, 'low'],
    [9.5, 'low'],
    [10, 'target'],
    [20, 'target'],
    [20.5, 'high'],
  ] as const)('puts %d sets at %s', (sets, level) => {
    expect(volumeLevel(sets)).toBe(level);
  });

  it('uses the fixed bands and lists the levels from none to high', () => {
    expect(volumeBands).toEqual({ low: 10, high: 20 });
    expect(volumeLevels).toEqual(['none', 'low', 'target', 'high']);
  });
});
