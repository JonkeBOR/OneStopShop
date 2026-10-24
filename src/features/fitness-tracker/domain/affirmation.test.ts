import { describe, expect, it } from 'vitest';
import { affirmationFacts, parseAffirmation } from './affirmation';
import type { SessionSlot, SessionView, SetLog } from './types';

function loggedSet(reps: number, weightKg: number | null): SetLog {
  return {
    id: 'set-id',
    exerciseId: 'exercise-id',
    performedAt: new Date('2026-01-05T08:10:00Z'),
    setNumber: 1,
    reps,
    weightKg,
    variantId: null,
    context: {
      programId: 'program-id',
      cycleId: 'cycle-id',
      pass: 1,
      trainingBlockId: 'block-id',
      blockNumber: 2,
      workoutId: 'workout-id',
      exerciseSlotId: 'slot-id',
      workoutSessionId: 'session-id',
    },
  };
}

function slot(name: string, loggedSets: SetLog[]): SessionSlot {
  return {
    id: `slot-${name}`,
    exercise: { id: `exercise-${name}`, name },
    isOptional: false,
    plannedSets: [],
    loggedSets,
    variant: null,
    hasVariantChoice: false,
  } as unknown as SessionSlot;
}

function session(overrides: Partial<SessionView>): SessionView {
  return {
    id: 'session-id',
    status: 'finished',
    startedAt: new Date('2026-01-05T08:00:00Z'),
    finishedAt: new Date('2026-01-05T09:04:00Z'),
    workout: { id: 'workout-id', name: 'Push A' },
    block: { id: 'block-id', number: 2, label: null },
    slots: [],
    ...overrides,
  };
}

describe('affirmationFacts', () => {
  it('turns a finished session into workout facts only', () => {
    const view = session({
      slots: [
        slot('Bench press', [loggedSet(8, 90), loggedSet(8, 92.5), loggedSet(6, 92.5)]),
        slot('Dips', [loggedSet(10, null), loggedSet(9, null)]),
        slot('Flyes', []),
      ],
    });

    expect(affirmationFacts(view)).toEqual({
      workout: 'Push A',
      block: 2,
      durationMinutes: 64,
      totalSets: 5,
      totalReps: 41,
      totalVolumeKg: 2015,
      exercises: [
        { name: 'Bench press', sets: 3, topWeightKg: 92.5 },
        { name: 'Dips', sets: 2, topWeightKg: null },
      ],
    });
  });

  it('has zero totals when nothing was logged', () => {
    const facts = affirmationFacts(session({ slots: [slot('Flyes', [])] }));

    expect(facts.totalSets).toBe(0);
    expect(facts.totalReps).toBe(0);
    expect(facts.totalVolumeKg).toBe(0);
    expect(facts.exercises).toEqual([]);
  });

  it('has no block number or duration when the session has none', () => {
    const facts = affirmationFacts(
      session({ block: { id: 'block-id', number: null, label: null }, finishedAt: null }),
    );

    expect(facts.block).toBeNull();
    expect(facts.durationMinutes).toBeNull();
  });
});

describe('parseAffirmation', () => {
  it('accepts a trimmed affirmation', () => {
    expect(parseAffirmation({ affirmation: '  Huge.  ' })).toBe('Huge.');
  });

  it('accepts exactly 200 characters', () => {
    const text = 'a'.repeat(200);

    expect(parseAffirmation({ affirmation: text })).toBe(text);
  });

  it.each([
    null,
    'Huge.',
    {},
    { affirmation: 42 },
    { affirmation: '   ' },
    { affirmation: 'a'.repeat(201) },
    { affirmation: 'one\ntwo' },
    { affirmation: 'one\rtwo' },
  ])('rejects what is not a usable affirmation', (value) => {
    expect(parseAffirmation(value)).toBeNull();
  });
});
