import { describe, expect, it } from 'vitest';
import {
  toBodyweightEntry,
  toCycle,
  toExercise,
  toExerciseVariant,
  toProgram,
  toSetLog,
  type ProgramRows,
} from './mapping';

const at = new Date('2026-10-02T10:00:00Z');

const setLogRow = {
  id: 'l1',
  profileId: 'p',
  exerciseId: 'e1',
  performedAt: at,
  setNumber: 2,
  reps: 10,
  weightGrams: 40000 as number | null,
  programId: 'pr',
  cycleId: 'c1',
  trainingBlockId: 'b1',
  workoutId: 'w1',
  exerciseSlotId: 's1',
  workoutSessionId: 'ws1',
  pass: 1,
  blockNumber: 2,
  variantId: 'v1' as string | null,
};

describe('toExercise', () => {
  it('maps archived_at to isArchived', () => {
    const base = { id: 'e1', profileId: 'p', name: 'Squat', nameKey: 'squat', createdAt: at };
    expect(toExercise({ ...base, archivedAt: null })).toEqual({
      id: 'e1',
      name: 'Squat',
      isArchived: false,
    });
    expect(toExercise({ ...base, archivedAt: at }).isArchived).toBe(true);
  });
});

describe('toExerciseVariant', () => {
  it('maps the variant row to its id and name', () => {
    expect(
      toExerciseVariant({
        id: 'v1',
        exerciseId: 'e1',
        name: 'Barbell',
        nameKey: 'barbell',
        createdAt: at,
        removedAt: null,
      }),
    ).toEqual({ id: 'v1', name: 'Barbell' });
  });
});

describe('toCycle', () => {
  it('maps the cycle row', () => {
    expect(toCycle({ id: 'c1', programId: 'pr', currentBlockId: 'b2', pass: 3 })).toEqual({
      id: 'c1',
      currentBlockId: 'b2',
      pass: 3,
    });
  });
});

describe('toSetLog', () => {
  it('converts grams to kilograms and nests the context', () => {
    const setLog = toSetLog(setLogRow);
    expect(setLog.weightKg).toBe(40);
    expect(setLog.context).toEqual({
      programId: 'pr',
      cycleId: 'c1',
      pass: 1,
      trainingBlockId: 'b1',
      blockNumber: 2,
      workoutId: 'w1',
      exerciseSlotId: 's1',
      workoutSessionId: 'ws1',
    });
  });

  it('keeps a missing weight as null', () => {
    expect(toSetLog({ ...setLogRow, weightGrams: null }).weightKg).toBeNull();
  });

  it('carries the variant the set was logged with', () => {
    expect(toSetLog(setLogRow).variantId).toBe('v1');
    expect(toSetLog({ ...setLogRow, variantId: null }).variantId).toBeNull();
  });
});

describe('toBodyweightEntry', () => {
  it('maps grams to kilograms and the entry date', () => {
    expect(
      toBodyweightEntry({
        id: 'b1',
        profileId: 'p',
        entryDate: '2026-10-02',
        weightGrams: 82500,
        recordedAt: at,
      }),
    ).toEqual({ id: 'b1', date: '2026-10-02', weightKg: 82.5 });
  });
});

describe('toProgram', () => {
  const exercise = {
    id: 'e1',
    profileId: 'p',
    name: 'Row',
    nameKey: 'row',
    archivedAt: null,
    createdAt: at,
  };

  const rows: ProgramRows = {
    program: { id: 'pr', profileId: 'p', name: 'Upper/Lower', createdAt: at },
    isActive: true,
    blocks: [
      { id: 'b2', programId: 'pr', position: 2, label: 'Deload' },
      { id: 'b1', programId: 'pr', position: 1, label: null },
    ],
    workouts: [
      { id: 'w2', programId: 'pr', position: 2, name: 'Lower A', slots: [] },
      {
        id: 'w1',
        programId: 'pr',
        position: 1,
        name: 'Upper A',
        slots: [
          {
            id: 's2',
            workoutId: 'w1',
            position: 2,
            exerciseId: 'e1',
            isOptional: true,
            isPeriodized: false,
            exercise,
            plannedSets: [],
          },
          {
            id: 's1',
            workoutId: 'w1',
            position: 1,
            exerciseId: 'e1',
            isOptional: false,
            isPeriodized: true,
            exercise,
            plannedSets: [
              {
                id: 'ps3',
                exerciseSlotId: 's1',
                trainingBlockId: 'b1',
                setNumber: 2,
                targetReps: 12,
                lastWeightGrams: 60000,
                variantId: null,
              },
              {
                id: 'ps1',
                exerciseSlotId: 's1',
                trainingBlockId: 'b1',
                setNumber: 1,
                targetReps: 12,
                lastWeightGrams: 62500,
                variantId: null,
              },
              {
                id: 'ps2',
                exerciseSlotId: 's1',
                trainingBlockId: 'b2',
                setNumber: 1,
                targetReps: 10,
                lastWeightGrams: null,
                variantId: null,
              },
            ],
          },
        ],
      },
    ],
    cycles: [{ id: 'c1', programId: 'pr', currentBlockId: 'b1', pass: 2 }],
  };

  it('orders blocks, workouts and slots by position', () => {
    const program = toProgram(rows);
    expect(program.blocks.map((block) => block.number)).toEqual([1, 2]);
    expect(program.blocks[1]?.label).toBe('Deload');
    expect(program.workouts.map((workout) => workout.name)).toEqual(['Upper A', 'Lower A']);
    expect(program.workouts[0]?.slots.map((slot) => slot.id)).toEqual(['s1', 's2']);
  });

  it('builds one prescription per block, ordered by set number, with kilograms', () => {
    const slot = toProgram(rows).workouts[0]?.slots[0];
    expect(slot?.prescriptions.map((prescription) => prescription.blockId)).toEqual(['b1', 'b2']);
    expect(slot?.prescriptions[0]?.plannedSets).toEqual([
      { id: 'ps1', setNumber: 1, targetReps: 12, lastWeightKg: 62.5 },
      { id: 'ps3', setNumber: 2, targetReps: 12, lastWeightKg: 60 },
    ]);
    expect(slot?.prescriptions[1]?.plannedSets).toEqual([
      { id: 'ps2', setNumber: 1, targetReps: 10, lastWeightKg: null },
    ]);
  });

  it('gives a slot with no planned sets an empty prescription for every block', () => {
    const slot = toProgram(rows).workouts[0]?.slots[1];
    expect(slot?.prescriptions.map((prescription) => prescription.plannedSets)).toEqual([[], []]);
  });

  it('reports whether each slot is periodized', () => {
    expect(toProgram(rows).workouts[0]?.slots.map((slot) => slot.isPeriodized)).toEqual([
      true,
      false,
    ]);
  });

  it('reports the cycle and the active flag', () => {
    const program = toProgram(rows);
    expect(program.isActive).toBe(true);
    expect(program.cycle).toEqual({ id: 'c1', currentBlockId: 'b1', pass: 2 });
  });

  it('refuses a program that has no cycle, because every program has one', () => {
    expect(() => toProgram({ ...rows, cycles: [] })).toThrow('no cycle');
  });
});
