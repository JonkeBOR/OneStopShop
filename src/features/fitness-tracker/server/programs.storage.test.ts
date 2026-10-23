import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../domain/types';
import { activateProgram, pauseActiveProgram } from './activation';
import { addExercise, archiveExercise } from './exercises';
import { ensureProfile } from './profile';
import {
  addExerciseSlot,
  addTrainingBlock,
  addWorkout,
  createProgram,
  getProgram,
  labelTrainingBlock,
  listPrograms,
  moveExerciseSlot,
  moveTrainingBlock,
  moveWorkout,
  removeTrainingBlock,
  removeWorkout,
  renameProgram,
  renameWorkout,
  replaceSlotExercise,
  setPrescription,
  setSlotOptional,
  setUniformPrescription,
} from './programs';
import { plannedSets, plannedSetVariantWeights, setLogs, workoutSessions } from './schema';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import {
  activeOverview,
  createProgramFromSpec,
  defaultVariantOf,
  expectOk,
  type ProgramSpec,
} from './storage-test-support';
import { finishWorkout, logSet, startWorkout } from './training';
import { addVariant, renameVariant } from './variants';

function targetsByBlock(program: Program, workoutIndex: number, slotIndex: number): number[][] {
  const slot = program.workouts[workoutIndex]?.slots[slotIndex];
  return (slot?.prescriptions ?? []).map((prescription) =>
    prescription.plannedSets.map((plannedSet) => plannedSet.targetReps),
  );
}

describe('program structure', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  let inclineBenchId: string;
  const now = new Date('2026-10-02T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    const { db } = testDatabase;
    profileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    inclineBenchId = expectOk(
      await addExercise(db, profileId, { name: 'Incline bench press' }, now),
    ).id;
  });

  async function programWithOneSlot(blockCount: number, targetReps: number[]) {
    const { db } = testDatabase;
    const created = expectOk(
      await createProgram(db, profileId, { name: 'Upper/Lower', blockCount }, now),
    );
    const withWorkout = expectOk(await addWorkout(db, profileId, created.id, { name: 'Upper A' }));
    const workoutId = withWorkout.workouts[0]?.id ?? '';
    const program = expectOk(
      await addExerciseSlot(db, profileId, workoutId, { exerciseId: inclineBenchId, targetReps }),
    );
    return { program, workoutId };
  }

  it('US1 scenario 2: each block returns its own planned sets, numbered from 1, with no last weight', async () => {
    const { db } = testDatabase;
    const { program: initial } = await programWithOneSlot(4, [12, 12, 12]);
    const slot = initial.workouts[0]?.slots[0];
    const blockIds = initial.blocks.map((block) => block.id);
    expectOk(await labelTrainingBlock(db, profileId, blockIds[3] ?? '', { label: 'Deload' }));

    const slotId = slot?.id ?? '';
    expectOk(
      await setPrescription(db, profileId, slotId, blockIds[1] ?? '', { targetReps: [10, 10, 10] }),
    );
    expectOk(
      await setPrescription(db, profileId, slotId, blockIds[2] ?? '', { targetReps: [8, 8, 8] }),
    );
    expectOk(
      await setPrescription(db, profileId, slotId, blockIds[3] ?? '', { targetReps: [10, 10] }),
    );

    const program = expectOk(await getProgram(db, profileId, initial.id));
    expect(program.blocks.map((block) => [block.number, block.label])).toEqual([
      [1, null],
      [2, null],
      [3, null],
      [4, 'Deload'],
    ]);
    expect(targetsByBlock(program, 0, 0)).toEqual([
      [12, 12, 12],
      [10, 10, 10],
      [8, 8, 8],
      [10, 10],
    ]);
    for (const prescription of program.workouts[0]?.slots[0]?.prescriptions ?? []) {
      expect(prescription.plannedSets.map((plannedSet) => plannedSet.setNumber)).toEqual(
        prescription.plannedSets.map((_, index) => index + 1),
      );
      expect(prescription.plannedSets.every((plannedSet) => plannedSet.lastWeightKg === null)).toBe(
        true,
      );
    }
  });

  it('US1 scenario 3: a target that is not a whole number of reps from 1 to 999 is refused and nothing is saved', async () => {
    const { db } = testDatabase;
    const { program, workoutId } = await programWithOneSlot(2, [10]);
    const slotId = program.workouts[0]?.slots[0]?.id ?? '';
    const blockId = program.blocks[0]?.id ?? '';
    const rowId = expectOk(await addExercise(db, profileId, { name: 'Row' }, now)).id;

    for (const invalid of [0, 12.5, 1000, -3]) {
      expect(
        await addExerciseSlot(db, profileId, workoutId, {
          exerciseId: rowId,
          targetReps: [10, invalid],
        }),
      ).toEqual({ ok: false, error: 'invalid-target' });
      expect(
        await setPrescription(db, profileId, slotId, blockId, { targetReps: [invalid] }),
      ).toEqual({
        ok: false,
        error: 'invalid-target',
      });
    }

    const unchanged = expectOk(await getProgram(db, profileId, program.id));
    expect(unchanged.workouts[0]?.slots).toHaveLength(1);
    expect(targetsByBlock(unchanged, 0, 0)).toEqual([[10], [10]]);
  });

  it('US1 scenario 4, rule 19: a new block copies the last block targets with empty last weight', async () => {
    const { db } = testDatabase;
    const { program: initial } = await programWithOneSlot(2, [12, 12, 12]);
    const slotId = initial.workouts[0]?.slots[0]?.id ?? '';
    expectOk(
      await setPrescription(db, profileId, slotId, initial.blocks[1]?.id ?? '', {
        targetReps: [8, 8],
      }),
    );
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 50000 })
      .where(eq(plannedSets.exerciseSlotId, slotId));

    const program = expectOk(await addTrainingBlock(db, profileId, initial.id, {}));

    expect(program.blocks.map((block) => block.number)).toEqual([1, 2, 3]);
    expect(targetsByBlock(program, 0, 0)).toEqual([
      [12, 12, 12],
      [8, 8],
      [8, 8],
    ]);
    const prescriptions = program.workouts[0]?.slots[0]?.prescriptions ?? [];
    expect(
      prescriptions[0]?.plannedSets.every((plannedSet) => plannedSet.lastWeightKg === 50),
    ).toBe(true);
    expect(
      prescriptions[2]?.plannedSets.every((plannedSet) => plannedSet.lastWeightKg === null),
    ).toBe(true);
  });

  it('US1 scenario 5, rule 20: marking a slot optional changes only the optional marker', async () => {
    const { db } = testDatabase;
    const { program: before } = await programWithOneSlot(3, [10, 10]);
    const slotId = before.workouts[0]?.slots[0]?.id ?? '';

    const after = expectOk(await setSlotOptional(db, profileId, slotId, { isOptional: true }));

    expect(before.workouts[0]?.slots[0]?.isOptional).toBe(false);
    expect(after.workouts[0]?.slots[0]?.isOptional).toBe(true);
    const slotBefore = before.workouts[0]?.slots[0];
    const slotAfter = after.workouts[0]?.slots[0];
    expect({ ...slotAfter, isOptional: false }).toEqual(slotBefore);
    expect(after.blocks).toEqual(before.blocks);
  });

  it('creates a program with the requested number of unlabeled blocks and no workouts', async () => {
    const { db } = testDatabase;
    const program = expectOk(
      await createProgram(db, profileId, { name: '  5/3/1 ', blockCount: 4 }, now),
    );
    expect(program).toMatchObject({
      name: '5/3/1',
      isActive: false,
      workouts: [],
      cycle: { pass: 1 },
    });
    expect(program.blocks.map((block) => [block.number, block.label])).toEqual([
      [1, null],
      [2, null],
      [3, null],
      [4, null],
    ]);
  });

  it('refuses a program with no blocks or no name', async () => {
    const { db } = testDatabase;
    expect(await createProgram(db, profileId, { name: 'Empty', blockCount: 0 }, now)).toEqual({
      ok: false,
      error: 'invalid-block-count',
    });
    expect(await createProgram(db, profileId, { name: ' ', blockCount: 2 }, now)).toEqual({
      ok: false,
      error: 'name-required',
    });
  });

  it('refuses a program name the profile already uses, ignoring case and surrounding spaces', async () => {
    const { db } = testDatabase;
    expectOk(await createProgram(db, profileId, { name: 'Upper Lower', blockCount: 1 }, now));
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    expect(
      await createProgram(db, profileId, { name: ' upper LOWER ', blockCount: 1 }, now),
    ).toEqual({ ok: false, error: 'name-taken' });
    expectOk(await createProgram(db, otherProfileId, { name: 'Upper Lower', blockCount: 1 }, now));
    expect((await listPrograms(db, profileId)).map((program) => program.name)).toEqual([
      'Upper Lower',
    ]);
  });

  it('refuses renaming a program to another program’s name, but keeps its own name in any case', async () => {
    const { db } = testDatabase;
    expectOk(await createProgram(db, profileId, { name: '5/3/1', blockCount: 1 }, now));
    const other = expectOk(
      await createProgram(db, profileId, { name: 'Full body', blockCount: 1 }, now),
    );

    expect(await renameProgram(db, profileId, other.id, { name: '5/3/1 ' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
    expect(expectOk(await renameProgram(db, profileId, other.id, { name: 'FULL BODY' })).name).toBe(
      'FULL BODY',
    );
  });

  it('refuses a workout name the program already uses, on add and on rename, but not across programs', async () => {
    const { db } = testDatabase;
    const first = expectOk(
      await createProgram(db, profileId, { name: 'First', blockCount: 1 }, now),
    );
    const second = expectOk(
      await createProgram(db, profileId, { name: 'Second', blockCount: 1 }, now),
    );
    expectOk(await addWorkout(db, profileId, first.id, { name: 'Day A' }));
    const dayB =
      expectOk(await addWorkout(db, profileId, first.id, { name: 'Day B' })).workouts[1]?.id ?? '';

    expect(await addWorkout(db, profileId, first.id, { name: 'day a ' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
    expect(await renameWorkout(db, profileId, dayB, { name: 'DAY A' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
    expectOk(await renameWorkout(db, profileId, dayB, { name: 'day b' }));
    expectOk(await addWorkout(db, profileId, second.id, { name: 'Day A' }));
    expect(
      expectOk(await getProgram(db, profileId, first.id)).workouts.map((workout) => workout.name),
    ).toEqual(['Day A', 'day b']);
  });

  it('refuses an archived exercise and a slot with no planned sets', async () => {
    const { db } = testDatabase;
    const created = expectOk(await createProgram(db, profileId, { name: 'P', blockCount: 2 }, now));
    const workoutId =
      expectOk(await addWorkout(db, profileId, created.id, { name: 'A' })).workouts[0]?.id ?? '';
    const archived = expectOk(await addExercise(db, profileId, { name: 'Old lift' }, now));
    expectOk(await archiveExercise(db, profileId, archived.id, now));

    expect(
      await addExerciseSlot(db, profileId, workoutId, {
        exerciseId: archived.id,
        targetReps: [10],
      }),
    ).toEqual({
      ok: false,
      error: 'exercise-archived',
    });
    expect(
      await addExerciseSlot(db, profileId, workoutId, {
        exerciseId: inclineBenchId,
        targetReps: [],
      }),
    ).toEqual({
      ok: false,
      error: 'prescription-needs-a-set',
    });
    expect(expectOk(await getProgram(db, profileId, created.id)).workouts[0]?.slots).toEqual([]);
  });

  it('refuses an exercise the workout already has, when adding or replacing', async () => {
    const { db } = testDatabase;
    const { program, workoutId } = await programWithOneSlot(2, [10]);
    const row = expectOk(await addExercise(db, profileId, { name: 'Row' }, now));
    const withRow = expectOk(
      await addExerciseSlot(db, profileId, workoutId, { exerciseId: row.id, targetReps: [10] }),
    );
    const [benchSlot, rowSlot] = withRow.workouts[0]?.slots ?? [];

    expect(
      await addExerciseSlot(db, profileId, workoutId, {
        exerciseId: inclineBenchId,
        targetReps: [8],
      }),
    ).toEqual({ ok: false, error: 'exercise-already-in-workout' });
    expect(
      await replaceSlotExercise(db, profileId, rowSlot?.id ?? '', { exerciseId: inclineBenchId }),
    ).toEqual({ ok: false, error: 'exercise-already-in-workout' });
    expectOk(
      await replaceSlotExercise(db, profileId, benchSlot?.id ?? '', { exerciseId: inclineBenchId }),
    );
    expect(
      expectOk(await getProgram(db, profileId, program.id)).workouts[0]?.slots.map(
        (slot) => slot.exercise.id,
      ),
    ).toEqual([inclineBenchId, row.id]);
  });

  it('allows the same exercise in different workouts', async () => {
    const { db } = testDatabase;
    const { program } = await programWithOneSlot(1, [10]);
    const otherWorkoutId =
      expectOk(await addWorkout(db, profileId, program.id, { name: 'Upper B' })).workouts[1]?.id ??
      '';

    expectOk(
      await addExerciseSlot(db, profileId, otherWorkoutId, {
        exerciseId: inclineBenchId,
        targetReps: [10],
      }),
    );
  });

  it('keeps the planned sets that still exist when a prescription changes', async () => {
    const { db } = testDatabase;
    const { program: initial } = await programWithOneSlot(2, [10, 10, 10]);
    const slot = initial.workouts[0]?.slots[0];
    const blockId = initial.blocks[0]?.id ?? '';
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 40000 })
      .where(eq(plannedSets.exerciseSlotId, slot?.id ?? ''));

    const program = expectOk(
      await setPrescription(db, profileId, slot?.id ?? '', blockId, { targetReps: [12, 12] }),
    );

    const sets = program.workouts[0]?.slots[0]?.prescriptions[0]?.plannedSets ?? [];
    expect(
      sets.map((plannedSet) => [
        plannedSet.setNumber,
        plannedSet.targetReps,
        plannedSet.lastWeightKg,
      ]),
    ).toEqual([
      [1, 12, 40],
      [2, 12, 40],
    ]);
  });

  async function plannedSetsOfSlot(slotId: string) {
    return testDatabase.db
      .select({
        trainingBlockId: plannedSets.trainingBlockId,
        setNumber: plannedSets.setNumber,
        variantId: plannedSets.variantId,
        lastWeightGrams: plannedSets.lastWeightGrams,
      })
      .from(plannedSets)
      .where(eq(plannedSets.exerciseSlotId, slotId));
  }

  async function parkedWeightsOfSlot(slotId: string) {
    return testDatabase.db
      .select({
        variantId: plannedSetVariantWeights.variantId,
        lastWeightGrams: plannedSetVariantWeights.lastWeightGrams,
      })
      .from(plannedSetVariantWeights)
      .innerJoin(plannedSets, eq(plannedSets.id, plannedSetVariantWeights.plannedSetId))
      .where(eq(plannedSets.exerciseSlotId, slotId));
  }

  async function addVariants(exerciseId: string, names: readonly string[]): Promise<string[]> {
    const { db } = testDatabase;
    const [first, ...rest] = names;
    const defaultVariant = await defaultVariantOf(db, exerciseId);
    expectOk(
      await renameVariant(db, profileId, exerciseId, defaultVariant.id, { name: first ?? '' }),
    );
    const ids = [defaultVariant.id];
    for (const [index, name] of rest.entries()) {
      const createdAt = new Date(now.getTime() + (index + 1) * 60_000);
      ids.push(expectOk(await addVariant(db, profileId, exerciseId, { name }, createdAt)).id);
    }
    return ids;
  }

  it('a new slot starts on the exercise’s oldest active variant with no weights', async () => {
    const [barbellId] = await addVariants(inclineBenchId, ['Barbell', 'Dumbbell']);

    const { program } = await programWithOneSlot(2, [10, 10]);

    const slotId = program.workouts[0]?.slots[0]?.id ?? '';
    const rows = await plannedSetsOfSlot(slotId);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.variantId === barbellId && row.lastWeightGrams === null)).toBe(
      true,
    );
    expect(await parkedWeightsOfSlot(slotId)).toEqual([]);
  });

  it('replacing a slot’s exercise selects the new exercise’s oldest active variant and drops all parked weights', async () => {
    const { db } = testDatabase;
    const [, dumbbellId] = await addVariants(inclineBenchId, ['Barbell', 'Dumbbell']);
    const { program } = await programWithOneSlot(2, [10, 10]);
    const slotId = program.workouts[0]?.slots[0]?.id ?? '';
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 40000 })
      .where(eq(plannedSets.exerciseSlotId, slotId));
    const plannedSetIds = (program.workouts[0]?.slots[0]?.prescriptions ?? []).flatMap(
      (prescription) => prescription.plannedSets.map((plannedSet) => plannedSet.id),
    );
    await db.insert(plannedSetVariantWeights).values(
      plannedSetIds.map((plannedSetId) => ({
        plannedSetId,
        variantId: dumbbellId ?? '',
        lastWeightGrams: 30000,
      })),
    );
    const pressId = expectOk(await addExercise(db, profileId, { name: 'Machine press' }, now)).id;
    const [plateLoadedId] = await addVariants(pressId, ['Plate loaded', 'Selectorized']);

    expectOk(await replaceSlotExercise(db, profileId, slotId, { exerciseId: pressId }));

    const replaced = await plannedSetsOfSlot(slotId);
    expect(replaced).toHaveLength(4);
    expect(
      replaced.every((row) => row.variantId === plateLoadedId && row.lastWeightGrams === null),
    ).toBe(true);
    expect(await parkedWeightsOfSlot(slotId)).toEqual([]);
  });

  it('adding sets to a prescription gives the new planned sets the slot’s variant', async () => {
    const { db } = testDatabase;
    const [barbellId] = await addVariants(inclineBenchId, ['Barbell', 'Dumbbell']);
    const { program, workoutId } = await programWithOneSlot(2, [10]);
    const periodizedSlotId = program.workouts[0]?.slots[0]?.id ?? '';
    const rowId = expectOk(await addExercise(db, profileId, { name: 'Row' }, now)).id;
    const [cableId] = await addVariants(rowId, ['Cable', 'Chest supported']);
    const withRow = expectOk(
      await addExerciseSlot(db, profileId, workoutId, {
        exerciseId: rowId,
        targetReps: [10],
        isPeriodized: false,
      }),
    );
    const uniformSlotId = withRow.workouts[0]?.slots[1]?.id ?? '';

    expectOk(
      await setPrescription(db, profileId, periodizedSlotId, program.blocks[1]?.id ?? '', {
        targetReps: [10, 10, 10],
      }),
    );
    expectOk(await setUniformPrescription(db, profileId, uniformSlotId, { targetReps: [8, 8] }));

    const periodized = await plannedSetsOfSlot(periodizedSlotId);
    expect(periodized).toHaveLength(4);
    expect(periodized.every((row) => row.variantId === barbellId)).toBe(true);
    const uniform = await plannedSetsOfSlot(uniformSlotId);
    expect(uniform).toHaveLength(4);
    expect(uniform.every((row) => row.variantId === cableId)).toBe(true);
  });

  it('the weekly volume estimate is unchanged by variants', async () => {
    const { db } = testDatabase;
    const { program } = await programWithOneSlot(2, [10, 10]);
    const before = expectOk(await getProgram(db, profileId, program.id));

    await addVariants(inclineBenchId, ['Barbell', 'Dumbbell']);

    expect(expectOk(await getProgram(db, profileId, program.id))).toEqual(before);
  });

  it('moves workouts, slots and blocks, renumbering positions 1 to n without gaps', async () => {
    const { db } = testDatabase;
    const { program: first, workoutId: upperId } = await programWithOneSlot(3, [10]);
    const lowerId =
      expectOk(await addWorkout(db, profileId, first.id, { name: 'Lower A' })).workouts[1]?.id ??
      '';
    const pushId =
      expectOk(await addWorkout(db, profileId, first.id, { name: 'Push' })).workouts[2]?.id ?? '';

    const reordered = expectOk(await moveWorkout(db, profileId, pushId, { toPosition: 1 }));
    expect(reordered.workouts.map((workout) => workout.name)).toEqual([
      'Push',
      'Upper A',
      'Lower A',
    ]);

    const rowId = expectOk(await addExercise(db, profileId, { name: 'Row' }, now)).id;
    expectOk(
      await addExerciseSlot(db, profileId, upperId, {
        exerciseId: rowId,
        targetReps: [8],
      }),
    );
    const withTwoSlots = expectOk(await getProgram(db, profileId, first.id));
    const secondSlotId = withTwoSlots.workouts[1]?.slots[1]?.id ?? '';
    const slotsMoved = expectOk(
      await moveExerciseSlot(db, profileId, secondSlotId, { toPosition: 1 }),
    );
    expect(slotsMoved.workouts[1]?.slots.map((slot) => slot.id)).toEqual([
      secondSlotId,
      withTwoSlots.workouts[1]?.slots[0]?.id,
    ]);

    const lastBlockId = first.blocks[2]?.id ?? '';
    expectOk(await labelTrainingBlock(db, profileId, lastBlockId, { label: 'Deload' }));
    const blocksMoved = expectOk(
      await moveTrainingBlock(db, profileId, lastBlockId, { toPosition: 1 }),
    );
    expect(blocksMoved.blocks.map((block) => [block.number, block.label])).toEqual([
      [1, 'Deload'],
      [2, null],
      [3, null],
    ]);
    expect(lowerId).not.toBe('');
  });

  it('refuses a move to a position that does not exist', async () => {
    const { db } = testDatabase;
    const { program, workoutId } = await programWithOneSlot(2, [10]);
    expect(await moveWorkout(db, profileId, workoutId, { toPosition: 0 })).toEqual({
      ok: false,
      error: 'invalid-position',
    });
    expect(await moveWorkout(db, profileId, workoutId, { toPosition: 2 })).toEqual({
      ok: false,
      error: 'invalid-position',
    });
    expect(
      await moveTrainingBlock(db, profileId, program.blocks[0]?.id ?? '', { toPosition: 3 }),
    ).toEqual({
      ok: false,
      error: 'invalid-position',
    });
  });
  it('FR-025, FR-041: lists each program with its number of blocks and workouts', async () => {
    const { db } = testDatabase;
    const big = expectOk(await createProgram(db, profileId, { name: 'Big', blockCount: 3 }, now));
    expectOk(await addWorkout(db, profileId, big.id, { name: 'Upper' }));
    expectOk(await addWorkout(db, profileId, big.id, { name: 'Lower' }));
    expectOk(
      await createProgram(
        db,
        profileId,
        { name: 'Small', blockCount: 1 },
        new Date(now.getTime() + 1000),
      ),
    );
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const foreign = expectOk(
      await createProgram(db, otherProfileId, { name: 'Foreign', blockCount: 5 }, now),
    );
    expectOk(await addWorkout(db, otherProfileId, foreign.id, { name: 'Other' }));

    const summaries = await listPrograms(db, profileId);

    expect(
      summaries.map((summary) => [summary.name, summary.blockCount, summary.workoutCount]),
    ).toEqual([
      ['Big', 3, 2],
      ['Small', 1, 0],
    ]);
  });
});

describe.each(['active', 'paused'] as const)(
  'editing a %s program in the middle of a pass',
  (mode) => {
    let testDatabase: TestDatabase;
    let profileId: string;
    let clock: number;

    beforeAll(async () => {
      testDatabase = await openTestDatabase();
    });

    afterAll(async () => {
      await testDatabase.dispose();
    });

    beforeEach(async () => {
      clock = Date.parse('2026-10-01T08:00:00Z');
      profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), tick())).id;
    });

    function tick(): Date {
      clock += 60_000;
      return new Date(clock);
    }

    const fourBlocksOneWorkout: ProgramSpec = {
      blockCount: 4,
      workouts: [{ name: 'Only', slots: [{ exercise: 'Squat', targetReps: [5] }] }],
    };

    async function activateAndTrain(spec: ProgramSpec, finishedBlocks: number): Promise<Program> {
      const { db } = testDatabase;
      const program = await createProgramFromSpec(db, profileId, spec, tick());
      expectOk(await activateProgram(db, profileId, program.id, tick()));
      for (let block = 0; block < finishedBlocks; block += 1) {
        const session = expectOk(
          await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
        );
        expectOk(await finishWorkout(db, profileId, session.id, tick()));
      }
      if (mode === 'paused') {
        expectOk(await pauseActiveProgram(db, profileId, tick()));
      }
      return program;
    }

    async function reload(program: Program): Promise<Program> {
      return expectOk(await getProgram(testDatabase.db, profileId, program.id));
    }

    function numberOf(program: Program, blockId: string): number | undefined {
      return program.blocks.find((block) => block.id === blockId)?.number;
    }

    it('FR-043: removing a block before the current one keeps the user on the same block', async () => {
      const { db } = testDatabase;
      const program = await activateAndTrain(fourBlocksOneWorkout, 2);
      const currentBlockId = program.blocks[2]?.id ?? '';
      expect((await reload(program)).cycle.currentBlockId).toBe(currentBlockId);

      expectOk(await removeTrainingBlock(db, profileId, program.blocks[0]?.id ?? '', tick()));

      const edited = await reload(program);
      expect(edited.cycle).toMatchObject({ currentBlockId, pass: 1 });
      expect(numberOf(edited, currentBlockId)).toBe(2);
      if (mode === 'active') {
        const overview = await activeOverview(db, profileId);
        expect(overview.currentBlock).toMatchObject({ id: currentBlockId, number: 2 });
        expect(overview.blocks.map((block) => block.status)).toEqual([
          'complete',
          'current',
          'upcoming',
        ]);
      }
    });

    it('FR-043: removing the current block moves to the block that followed it, with none of its workouts finished', async () => {
      const { db } = testDatabase;
      const program = await activateAndTrain(fourBlocksOneWorkout, 1);
      const sessionsBefore = await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.profileId, profileId));

      expectOk(await removeTrainingBlock(db, profileId, program.blocks[1]?.id ?? '', tick()));

      const edited = await reload(program);
      expect(edited.cycle).toMatchObject({ currentBlockId: program.blocks[2]?.id, pass: 1 });
      expect(numberOf(edited, program.blocks[2]?.id ?? '')).toBe(2);
      if (mode === 'active') {
        const overview = await activeOverview(db, profileId);
        expect(overview.workouts.map((workout) => workout.status)).toEqual(['not-started']);
        expect(overview.suggestedWorkoutId).toBe(program.workouts[0]?.id);
      }
      expect(
        await db.select().from(workoutSessions).where(eq(workoutSessions.profileId, profileId)),
      ).toEqual(sessionsBefore);
    });

    it('FR-043: removing the current block when it is the last starts a new pass at the first block', async () => {
      const { db } = testDatabase;
      const program = await activateAndTrain(fourBlocksOneWorkout, 3);
      expect((await reload(program)).cycle.currentBlockId).toBe(program.blocks[3]?.id);

      expectOk(await removeTrainingBlock(db, profileId, program.blocks[3]?.id ?? '', tick()));

      expect((await reload(program)).cycle).toMatchObject({
        currentBlockId: program.blocks[0]?.id,
        pass: 2,
      });
      expect(
        await db.select().from(workoutSessions).where(eq(workoutSessions.profileId, profileId)),
      ).toHaveLength(3);
    });

    it('FR-043: removing a block after the current one changes nothing', async () => {
      const { db } = testDatabase;
      const program = await activateAndTrain(fourBlocksOneWorkout, 1);

      expectOk(await removeTrainingBlock(db, profileId, program.blocks[3]?.id ?? '', tick()));

      expect((await reload(program)).cycle).toMatchObject({
        currentBlockId: program.blocks[1]?.id,
        pass: 1,
      });
    });

    it('FR-043: moving blocks keeps the user on the same block', async () => {
      const { db } = testDatabase;
      const program = await activateAndTrain(fourBlocksOneWorkout, 1);

      expectOk(
        await moveTrainingBlock(db, profileId, program.blocks[1]?.id ?? '', { toPosition: 1 }),
      );

      const edited = await reload(program);
      expect(edited.cycle.currentBlockId).toBe(program.blocks[1]?.id);
      expect(numberOf(edited, program.blocks[1]?.id ?? '')).toBe(1);
    });

    it('FR-039, FR-042: removing the only unfinished workout moves to the next block', async () => {
      const { db } = testDatabase;
      const program = await createProgramFromSpec(
        db,
        profileId,
        {
          blockCount: 3,
          workouts: [
            { name: 'Upper', slots: [{ exercise: 'Press', targetReps: [5] }] },
            { name: 'Lower', slots: [{ exercise: 'Squat', targetReps: [5] }] },
          ],
        },
        tick(),
      );
      expectOk(await activateProgram(db, profileId, program.id, tick()));
      const session = expectOk(
        await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
      );
      expectOk(await finishWorkout(db, profileId, session.id, tick()));
      if (mode === 'paused') {
        expectOk(await pauseActiveProgram(db, profileId, tick()));
      }

      expectOk(await removeWorkout(db, profileId, program.workouts[1]?.id ?? '', tick()));

      expect((await reload(program)).cycle).toMatchObject({
        currentBlockId: program.blocks[1]?.id,
        pass: 1,
      });
    });
  },
);

describe('removing a workout that is in progress', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  let clock: number;

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    clock = Date.parse('2026-10-01T08:00:00Z');
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), tick())).id;
  });

  function tick(): Date {
    clock += 60_000;
    return new Date(clock);
  }

  it('FR-042: closes its session as finished and keeps its set logs', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 2,
        workouts: [
          { name: 'Upper', slots: [{ exercise: 'Press', targetReps: [5] }] },
          { name: 'Lower', slots: [{ exercise: 'Squat', targetReps: [5] }] },
        ],
      },
      tick(),
    );
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    const session = expectOk(
      await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
    );
    expectOk(
      await logSet(
        db,
        profileId,
        session.id,
        session.slots[0]?.plannedSets[0]?.id ?? '',
        { reps: 5, weightKg: 60 },
        tick(),
      ),
    );
    const removedAt = tick();

    expectOk(await removeWorkout(db, profileId, program.workouts[0]?.id ?? '', removedAt));

    const [stored] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, session.id));
    expect(stored).toMatchObject({ status: 'finished', finishedAt: removedAt });
    expect(
      await db.select().from(setLogs).where(eq(setLogs.workoutSessionId, session.id)),
    ).toHaveLength(1);
    const overview = await activeOverview(db, profileId);
    expect(overview.workouts.map((workout) => workout.name)).toEqual(['Lower']);
  });
});
