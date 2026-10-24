import { describe, expect, it } from 'vitest';
import {
  bestEstimatedOneRepMaxKg,
  exerciseVariantKey,
  sessionAchievement,
  type PreviousBests,
} from './achievement';
import type { SessionSlot, SessionView, SetLog } from './types';

type LoggedSet = readonly [reps: number, weightKg: number | null];

type SlotSpec = {
  exerciseId: string;
  optional?: boolean;
  planned: number;
  logged?: readonly LoggedSet[];
  variantId?: string;
};

function setLog(
  exerciseId: string,
  variantId: string,
  [reps, weightKg]: LoggedSet,
  index: number,
): SetLog {
  return {
    id: `${exerciseId}-log-${index}`,
    exerciseId,
    performedAt: new Date(Date.UTC(2026, 9, 24, 9, index)),
    setNumber: index + 1,
    reps,
    weightKg,
    variantId,
    context: {
      programId: 'program',
      cycleId: 'cycle',
      pass: 1,
      trainingBlockId: 'block',
      blockNumber: 1,
      workoutId: 'workout',
      exerciseSlotId: `${exerciseId}-slot`,
      workoutSessionId: 'session',
    },
  };
}

function slot({
  exerciseId,
  optional = false,
  planned,
  logged = [],
  variantId = 'v',
}: SlotSpec): SessionSlot {
  return {
    id: `${exerciseId}-slot`,
    exercise: { id: exerciseId, name: exerciseId, isArchived: false },
    isOptional: optional,
    plannedSets: Array.from({ length: planned }, (_, index) => ({
      id: `${exerciseId}-planned-${index}`,
      setNumber: index + 1,
      targetReps: 5,
      suggestedWeightKg: null,
    })),
    loggedSets: logged.map((set, index) => setLog(exerciseId, variantId, set, index)),
    variant: { id: variantId, name: variantId },
    hasVariantChoice: false,
  };
}

function session(...slots: SessionSlot[]): SessionView {
  return {
    id: 'session',
    status: 'finished',
    startedAt: new Date('2026-10-24T09:00:00Z'),
    finishedAt: new Date('2026-10-24T10:00:00Z'),
    workout: { id: 'workout', name: 'Day' },
    block: { id: 'block', number: 1, label: null },
    slots,
  };
}

function bests(entries: Record<string, number>): PreviousBests {
  return new Map(Object.entries(entries));
}

const noHistory: PreviousBests = new Map();

describe('sessionAchievement', () => {
  it('is skipped-whole-workout when no set is logged', () => {
    expect(sessionAchievement(session(slot({ exerciseId: 'press', planned: 2 })), noHistory)).toBe(
      'skipped-whole-workout',
    );
  });

  it('is skipped-whole-exercise when a required exercise has no sets', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[5, 100]] }),
      slot({ exerciseId: 'squat', planned: 1 }),
    );

    expect(sessionAchievement(finished, noHistory)).toBe('skipped-whole-exercise');
  });

  it('is skipped-sets when every required exercise has some sets but one is short', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[5, 100]] }),
      slot({ exerciseId: 'squat', planned: 3, logged: [[5, 120]] }),
    );

    expect(sessionAchievement(finished, noHistory)).toBe('skipped-sets');
  });

  it('prefers skipped-whole-exercise when one exercise is skipped whole and another partly', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 3, logged: [[5, 100]] }),
      slot({ exerciseId: 'squat', planned: 1 }),
    );

    expect(sessionAchievement(finished, noHistory)).toBe('skipped-whole-exercise');
  });

  it('ignores a skipped optional exercise', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[5, 100]] }),
      slot({ exerciseId: 'curl', planned: 2, optional: true }),
    );

    expect(sessionAchievement(finished, noHistory)).toBe('fully-completed');
  });

  it('ignores a required slot with no planned sets', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[5, 100]] }),
      slot({ exerciseId: 'squat', planned: 0 }),
    );

    expect(sessionAchievement(finished, noHistory)).toBe('fully-completed');
  });

  it('is fully-completed when nothing has history', () => {
    const finished = session(slot({ exerciseId: 'press', planned: 1, logged: [[5, 100]] }));

    expect(sessionAchievement(finished, noHistory)).toBe('fully-completed');
  });

  it('is fully-completed when an exercise with history did not improve', () => {
    const finished = session(slot({ exerciseId: 'press', planned: 1, logged: [[1, 100]] }));

    expect(sessionAchievement(finished, bests({ 'press|v': 100 }))).toBe('fully-completed');
  });

  it('is fully-completed-with-improvements when one of two exercises with history improved', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[1, 101]] }),
      slot({ exerciseId: 'squat', planned: 1, logged: [[1, 150]] }),
    );

    expect(sessionAchievement(finished, bests({ 'press|v': 100, 'squat|v': 150 }))).toBe(
      'fully-completed-with-improvements',
    );
  });

  it('counts an improved optional exercise', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[1, 100]] }),
      slot({ exerciseId: 'curl', planned: 1, optional: true, logged: [[1, 21]] }),
    );

    expect(sessionAchievement(finished, bests({ 'press|v': 100, 'curl|v': 20 }))).toBe(
      'fully-completed-with-improvements',
    );
  });

  it('is fully-completed-with-improvements-on-every-exercise when every exercise with history improved', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[1, 101]] }),
      slot({ exerciseId: 'squat', planned: 1, logged: [[1, 151]] }),
    );

    expect(sessionAchievement(finished, bests({ 'press|v': 100, 'squat|v': 150 }))).toBe(
      'fully-completed-with-improvements-on-every-exercise',
    );
  });

  it('does not count an exercise without history against every exercise', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[1, 101]] }),
      slot({ exerciseId: 'squat', planned: 1, logged: [[1, 80]] }),
    );

    expect(sessionAchievement(finished, bests({ 'press|v': 100 }))).toBe(
      'fully-completed-with-improvements-on-every-exercise',
    );
  });

  it('ignores sets without a weight', () => {
    const finished = session(slot({ exerciseId: 'press', planned: 1, logged: [[20, null]] }));

    expect(sessionAchievement(finished, bests({ 'press|v': 100 }))).toBe('fully-completed');
  });

  it('treats a different variant as no history', () => {
    const finished = session(
      slot({ exerciseId: 'press', planned: 1, logged: [[1, 101]], variantId: 'b' }),
    );

    expect(sessionAchievement(finished, bests({ 'press|a': 100 }))).toBe('fully-completed');
  });
});

describe('bestEstimatedOneRepMaxKg', () => {
  it('gives the best estimated 1RM of the weighted sets', () => {
    const sets = (
      [
        [5, 100],
        [1, 110],
        [8, null],
      ] as const
    ).map((set, index) => setLog('press', 'v', set, index));

    expect(bestEstimatedOneRepMaxKg(sets)).toBeCloseTo(116.667, 3);
  });

  it('gives nothing when no set has a weight', () => {
    expect(bestEstimatedOneRepMaxKg([setLog('press', 'v', [5, null], 0)])).toBeNull();
  });
});

describe('exerciseVariantKey', () => {
  it('keeps exercises and variants apart', () => {
    expect(exerciseVariantKey('press', 'v')).toBe('press|v');
    expect(exerciseVariantKey('press', null)).not.toBe(exerciseVariantKey('press', 'v'));
  });
});
