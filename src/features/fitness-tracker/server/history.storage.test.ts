import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exerciseVariantKey } from '../domain/achievement';
import type { Program, SessionView } from '../domain/types';
import { activateProgram } from './activation';
import { addExercise, archiveExercise, deleteExercise, listExercises } from './exercises';
import { getExerciseHistory, getPreviousBests } from './history';
import { ensureProfile } from './profile';
import {
  addWorkout,
  createProgram,
  deleteProgram,
  getProgram,
  listPrograms,
  removeTrainingBlock,
  renameProgram,
  removeWorkout,
  renameWorkout,
  replaceSlotExercise,
  setPrescription,
} from './programs';
import {
  cycles,
  exerciseSlots,
  plannedSets,
  profiles,
  programs,
  setLogs,
  trainingBlocks,
  workoutSessions,
  workouts,
} from './schema';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import {
  createProgramFromSpec,
  defaultVariantOf,
  expectOk,
  messagesOf,
  type ProgramSpec,
  rejectionOf,
} from './storage-test-support';
import { finishWorkout, getSession, getTrainingOverview, logSet, startWorkout } from './training';
import { addVariant, switchSlotVariant } from './variants';

describe('editing programs without losing history', () => {
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

  async function activate(spec: ProgramSpec): Promise<Program> {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, profileId, spec, tick());
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    return program;
  }

  async function logWorkout(
    workoutId: string,
    weights: number[],
    options: { finish: boolean } = { finish: true },
  ) {
    const { db } = testDatabase;
    const session = expectOk(await startWorkout(db, profileId, workoutId, tick()));
    for (const [index, plannedSet] of (session.slots[0]?.plannedSets ?? []).entries()) {
      expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          plannedSet.id,
          { reps: 10, weightKg: weights[index] },
          tick(),
        ),
      );
    }
    if (options.finish) {
      expectOk(await finishWorkout(db, profileId, session.id, tick()));
    }
    return session;
  }

  async function historyRows() {
    const { db } = testDatabase;
    return {
      logs: await db.select().from(setLogs).where(eq(setLogs.profileId, profileId)),
      sessions: await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.profileId, profileId)),
    };
  }

  function allLastWeights(program: Program, slotIndex = 0): (number | null)[][] {
    return (program.workouts[0]?.slots[slotIndex]?.prescriptions ?? []).map((prescription) =>
      prescription.plannedSets.map((plannedSet) => plannedSet.lastWeightKg),
    );
  }

  const twoWorkouts: ProgramSpec = {
    blockCount: 3,
    workouts: [
      { name: 'Upper A', slots: [{ exercise: 'Seal row', targetReps: [10, 10] }] },
      { name: 'Lower A', slots: [{ exercise: 'Squat', targetReps: [5] }] },
    ],
  };

  it('US4 scenario 1, rule 18: replacing the exercise clears every last weight of the slot and keeps the old set logs', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const slot = program.workouts[0]?.slots[0];
    await logWorkout(program.workouts[0]?.id ?? '', [50, 47.5]);
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 45000 })
      .where(eq(plannedSets.trainingBlockId, program.blocks[1]?.id ?? ''));
    const sealRowId = slot?.exercise.id ?? '';
    const machineRowId = expectOk(
      await addExercise(db, profileId, { name: 'Machine row' }, tick()),
    ).id;
    const logsBefore = (await historyRows()).logs;

    const edited = expectOk(
      await replaceSlotExercise(db, profileId, slot?.id ?? '', { exerciseId: machineRowId }),
    );

    expect(edited.workouts[0]?.slots[0]?.exercise.name).toBe('Machine row');
    expect(allLastWeights(edited)).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
    const history = expectOk(await getExerciseHistory(db, profileId, sealRowId));
    expect(history.exercise.name).toBe('Seal row');
    expect(history.setLogs.map((log) => log.weightKg)).toEqual([50, 47.5]);
    expect((await historyRows()).logs).toEqual(logsBefore);
  });

  it('replacing the exercise with an archived one is refused and clears nothing', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const slotId = program.workouts[0]?.slots[0]?.id ?? '';
    await logWorkout(program.workouts[0]?.id ?? '', [50, 47.5]);
    const archived = expectOk(await addExercise(db, profileId, { name: 'Retired lift' }, tick()));
    expectOk(await archiveExercise(db, profileId, archived.id, tick()));

    expect(await replaceSlotExercise(db, profileId, slotId, { exerciseId: archived.id })).toEqual({
      ok: false,
      error: 'exercise-archived',
    });
    expect(allLastWeights(expectOk(await getProgram(db, profileId, program.id)))[0]).toEqual([
      50, 47.5,
    ]);
  });

  it('US4 scenario 2, rule 19: adding a fourth set keeps sets 1 to 3 and gives set 4 no last weight', async () => {
    const { db } = testDatabase;
    const program = await activate({
      blockCount: 2,
      workouts: [
        { name: 'Upper A', slots: [{ exercise: 'Bench press', targetReps: [8, 8, 8] }] },
        { name: 'Lower A', slots: [] },
      ],
    });
    await logWorkout(program.workouts[0]?.id ?? '', [60, 57.5, 55], { finish: false });
    const slotId = program.workouts[0]?.slots[0]?.id ?? '';

    const edited = expectOk(
      await setPrescription(db, profileId, slotId, program.blocks[0]?.id ?? '', {
        targetReps: [8, 8, 8, 8],
      }),
    );

    expect(allLastWeights(edited)[0]).toEqual([60, 57.5, 55, null]);
    expect(allLastWeights(edited)[1]).toEqual([null, null, null]);
  });

  it('US4 scenario 3, FR-034: deleting a program keeps every set log and session and they stay readable', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    await logWorkout(program.workouts[0]?.id ?? '', [50, 47.5]);
    const before = await historyRows();

    expectOk(await deleteProgram(db, profileId, program.id, tick()));

    expect(await getProgram(db, profileId, program.id)).toEqual({ ok: false, error: 'not-found' });
    expect(await historyRows()).toEqual(before);
    const history = expectOk(
      await getExerciseHistory(db, profileId, program.workouts[0]?.slots[0]?.exercise.id ?? ''),
    );
    expect(history.exercise.name).toBe('Seal row');
    expect(history.setLogs).toHaveLength(2);
  });

  it('deleting a program keeps its row and name with deleted_at set, and removes its blocks, workouts, slots and cycle', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const deletedAt = tick();

    expectOk(await deleteProgram(db, profileId, program.id, deletedAt));

    const programRows = await db.select().from(programs).where(eq(programs.id, program.id));
    expect(programRows).toHaveLength(1);
    expect(programRows[0]).toMatchObject({ name: program.name, deletedAt });
    expect(
      await db.select().from(trainingBlocks).where(eq(trainingBlocks.programId, program.id)),
    ).toEqual([]);
    expect(await db.select().from(workouts).where(eq(workouts.programId, program.id))).toEqual([]);
    expect(
      await db
        .select()
        .from(exerciseSlots)
        .where(
          inArray(
            exerciseSlots.workoutId,
            program.workouts.map((workout) => workout.id),
          ),
        ),
    ).toEqual([]);
    expect(await db.select().from(cycles).where(eq(cycles.programId, program.id))).toEqual([]);
  });

  it('a deleted program is not found by getProgram, listPrograms, renameProgram, addWorkout or activateProgram, and deleting it again is not-found', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    expectOk(await deleteProgram(db, profileId, program.id, tick()));
    const notFound = { ok: false, error: 'not-found' };

    expect(await getProgram(db, profileId, program.id)).toEqual(notFound);
    expect(await listPrograms(db, profileId)).toEqual([]);
    expect(await renameProgram(db, profileId, program.id, { name: 'Other name' })).toEqual(
      notFound,
    );
    expect(await addWorkout(db, profileId, program.id, { name: 'Late' })).toEqual(notFound);
    expect(await activateProgram(db, profileId, program.id, tick())).toEqual(notFound);
    expect(await deleteProgram(db, profileId, program.id, tick())).toEqual(notFound);
  });

  it("a deleted program's name can be reused", async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    expectOk(await deleteProgram(db, profileId, program.id, tick()));

    const again = expectOk(
      await createProgram(db, profileId, { name: program.name, blockCount: 1 }, tick()),
    );

    expect(again.id).not.toBe(program.id);
    expect((await listPrograms(db, profileId)).map((entry) => entry.name)).toEqual([program.name]);
  });

  it('an exercise used only in a deleted program can be deleted', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const exerciseId = program.workouts[1]?.slots[0]?.exercise.id ?? '';
    expect(await deleteExercise(db, profileId, exerciseId)).toEqual({
      ok: false,
      error: 'exercise-in-use',
    });
    expectOk(await deleteProgram(db, profileId, program.id, tick()));

    expectOk(await deleteExercise(db, profileId, exerciseId));
  });

  it('deleting the active program leaves no active program and closes its open session as finished', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const open = expectOk(await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()));
    const deletedAt = tick();

    expectOk(await deleteProgram(db, profileId, program.id, deletedAt));

    const [profile] = await db
      .select({ activeProgramId: profiles.activeProgramId })
      .from(profiles)
      .where(eq(profiles.id, profileId));
    expect(profile?.activeProgramId).toBeNull();
    expect(await getTrainingOverview(db, profileId)).toBeNull();
    const [session] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, open.id));
    expect(session).toMatchObject({ status: 'finished', finishedAt: deletedAt });
    expect(await deleteProgram(db, profileId, program.id, tick())).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('US4 scenario 4, FR-005: an exercise with set logs or a slot cannot be deleted but can be archived', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    await logWorkout(program.workouts[0]?.id ?? '', [50, 47.5]);
    const logged = program.workouts[0]?.slots[0]?.exercise.id ?? '';
    const inSlotOnly = program.workouts[1]?.slots[0]?.exercise.id ?? '';

    expect(await deleteExercise(db, profileId, logged)).toEqual({
      ok: false,
      error: 'exercise-in-use',
    });
    expect(await deleteExercise(db, profileId, inSlotOnly)).toEqual({
      ok: false,
      error: 'exercise-in-use',
    });
    expectOk(await archiveExercise(db, profileId, logged, tick()));
    expect(expectOk(await getExerciseHistory(db, profileId, logged)).exercise).toMatchObject({
      name: 'Seal row',
      isArchived: true,
    });
  });

  it('deletes an exercise that nothing refers to', async () => {
    const { db } = testDatabase;
    const unused = expectOk(await addExercise(db, profileId, { name: 'Unused' }, tick()));

    expectOk(await deleteExercise(db, profileId, unused.id));

    expect(await listExercises(db, profileId, { includeArchived: true })).toEqual([]);
    expect(await deleteExercise(db, profileId, unused.id)).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('FR-033: set logs cannot be updated or deleted, even directly', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    await logWorkout(program.workouts[0]?.id ?? '', [50]);

    const update = await rejectionOf(async () => {
      await db.update(setLogs).set({ reps: 99 }).where(eq(setLogs.profileId, profileId));
    });
    const removal = await rejectionOf(async () => {
      await db.delete(setLogs).where(eq(setLogs.profileId, profileId));
    });

    expect(messagesOf(update)).toContain('set_logs are immutable');
    expect(messagesOf(removal)).toContain('set_logs are immutable');
    expect((await historyRows()).logs.map((log) => log.reps)).toEqual([10, 10]);
  });

  it('FR-039: removing the only unfinished workout of the current block advances to the next block', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const [upper, lower] = program.workouts;
    const session = expectOk(await startWorkout(db, profileId, upper?.id ?? '', tick()));
    expectOk(await finishWorkout(db, profileId, session.id, tick()));
    expect((await getTrainingOverview(db, profileId))?.currentBlock.number).toBe(1);

    expectOk(await removeWorkout(db, profileId, lower?.id ?? '', tick()));

    expect((await getTrainingOverview(db, profileId))?.currentBlock.number).toBe(2);
  });

  it('FR-039: adding a workout mid-block keeps the block incomplete until it is finished too', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    const [upper, lower] = program.workouts;
    const first = expectOk(await startWorkout(db, profileId, upper?.id ?? '', tick()));
    expectOk(await finishWorkout(db, profileId, first.id, tick()));
    const extra = expectOk(await addWorkout(db, profileId, program.id, { name: 'Extra' }));
    const extraId = extra.workouts[2]?.id ?? '';

    const second = expectOk(await startWorkout(db, profileId, lower?.id ?? '', tick()));
    expect(expectOk(await finishWorkout(db, profileId, second.id, tick()))).toMatchObject({
      progression: 'none',
    });
    const third = expectOk(await startWorkout(db, profileId, extraId, tick()));
    expect(expectOk(await finishWorkout(db, profileId, third.id, tick()))).toMatchObject({
      progression: 'block-advanced',
    });
  });

  async function finishOnlyWorkoutBlocks(program: Program, count: number) {
    const { db } = testDatabase;
    for (let block = 1; block <= count; block += 1) {
      const session = expectOk(
        await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
      );
      expectOk(await finishWorkout(db, profileId, session.id, tick()));
    }
  }

  const fourBlocksOneWorkout: ProgramSpec = {
    blockCount: 4,
    workouts: [{ name: 'Only', slots: [{ exercise: 'Squat', targetReps: [5] }] }],
  };

  it('FR-039, FR-043: removing the current last block starts a new pass, because the blocks before it are finished', async () => {
    const { db } = testDatabase;
    const program = await activate(fourBlocksOneWorkout);
    await finishOnlyWorkoutBlocks(program, 3);
    expect((await getTrainingOverview(db, profileId))?.currentBlock.number).toBe(4);

    expectOk(await removeTrainingBlock(db, profileId, program.blocks[3]?.id ?? '', tick()));

    const overview = await getTrainingOverview(db, profileId);
    expect(expectOk(await getProgram(db, profileId, program.id)).cycle.pass).toBe(2);
    expect(overview?.currentBlock).toMatchObject({ number: 1 });
    expect(overview?.blocks).toHaveLength(3);
  });

  it('FR-039: removing a block after the current one leaves the program where it is', async () => {
    const { db } = testDatabase;
    const program = await activate(fourBlocksOneWorkout);
    await finishOnlyWorkoutBlocks(program, 2);

    expectOk(await removeTrainingBlock(db, profileId, program.blocks[3]?.id ?? '', tick()));

    const overview = await getTrainingOverview(db, profileId);
    expect(expectOk(await getProgram(db, profileId, program.id)).cycle.pass).toBe(1);
    expect(overview?.currentBlock).toMatchObject({ number: 3 });
    expect(overview?.blocks).toHaveLength(3);
  });

  it('refuses to remove the last remaining block', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      { blockCount: 1, workouts: [] },
      tick(),
    );

    expect(await removeTrainingBlock(db, profileId, program.blocks[0]?.id ?? '', tick())).toEqual({
      ok: false,
      error: 'program-needs-a-block',
    });
    expect(expectOk(await getProgram(db, profileId, program.id)).blocks).toHaveLength(1);
  });

  it('rule 17: editing the program never changes existing sessions or set logs', async () => {
    const { db } = testDatabase;
    const program = await activate(twoWorkouts);
    await logWorkout(program.workouts[0]?.id ?? '', [50, 47.5]);
    const before = await historyRows();
    const slotId = program.workouts[0]?.slots[0]?.id ?? '';
    const machineRowId = expectOk(
      await addExercise(db, profileId, { name: 'Machine row' }, tick()),
    ).id;

    expectOk(
      await renameWorkout(db, profileId, program.workouts[0]?.id ?? '', { name: 'Renamed' }),
    );
    expectOk(
      await setPrescription(db, profileId, slotId, program.blocks[0]?.id ?? '', {
        targetReps: [6],
      }),
    );
    expectOk(await replaceSlotExercise(db, profileId, slotId, { exerciseId: machineRowId }));
    expectOk(await removeTrainingBlock(db, profileId, program.blocks[2]?.id ?? '', tick()));

    expect(await historyRows()).toEqual(before);
  });

  it('removing a block or workout that is not yours is refused', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, profileId, twoWorkouts, tick());
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), tick())).id;

    expect(await removeWorkout(db, otherProfileId, program.workouts[0]?.id ?? '', tick())).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(
      await removeTrainingBlock(db, otherProfileId, program.blocks[0]?.id ?? '', tick()),
    ).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await deleteProgram(db, otherProfileId, program.id, tick())).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(
      await getExerciseHistory(
        db,
        otherProfileId,
        program.workouts[0]?.slots[0]?.exercise.id ?? '',
      ),
    ).toEqual({
      ok: false,
      error: 'not-found',
    });
  });
});

describe('previous bests of a finished session', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  let program: Program;
  let clock: number;

  const fourWorkouts: ProgramSpec = {
    blockCount: 1,
    workouts: ['A', 'B', 'C', 'D'].map((name) => ({
      name,
      slots: [{ exercise: 'Press', targetReps: [5] }],
    })),
  };

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    const { db } = testDatabase;
    clock = Date.parse('2026-10-01T08:00:00Z');
    profileId = (await ensureProfile(db, crypto.randomUUID(), tick())).id;
    program = await createProgramFromSpec(db, profileId, fourWorkouts, tick());
    expectOk(await activateProgram(db, profileId, program.id, tick()));
  });

  function tick(): Date {
    clock += 60_000;
    return new Date(clock);
  }

  function workoutId(index: number): string {
    return program.workouts[index]?.id ?? '';
  }

  function pressId(): string {
    return program.workouts[0]?.slots[0]?.exercise.id ?? '';
  }

  async function train(
    index: number,
    weightKg: number | null,
    options: { finish?: boolean; variantId?: string } = {},
  ): Promise<string> {
    const { db } = testDatabase;
    const session = expectOk(await startWorkout(db, profileId, workoutId(index), tick()));
    const slot = session.slots[0];
    if (options.variantId !== undefined) {
      expectOk(
        await switchSlotVariant(db, profileId, session.id, slot?.id ?? '', {
          variantId: options.variantId,
        }),
      );
    }
    expectOk(
      await logSet(
        db,
        profileId,
        session.id,
        slot?.plannedSets[0]?.id ?? '',
        { reps: 5, weightKg },
        tick(),
      ),
    );
    if (options.finish ?? true) {
      expectOk(await finishWorkout(db, profileId, session.id, tick()));
    }
    return session.id;
  }

  async function view(sessionId: string): Promise<SessionView> {
    return expectOk(await getSession(testDatabase.db, profileId, sessionId));
  }

  async function defaultKey(): Promise<string> {
    return exerciseVariantKey(pressId(), (await defaultVariantOf(testDatabase.db, pressId())).id);
  }

  it('takes the best of the most recent previous finished session of the same exercise and variant', async () => {
    await train(0, 100);
    await train(1, 90);
    const current = await train(2, 80);

    const bests = await getPreviousBests(testDatabase.db, profileId, await view(current));

    expect(bests.get(await defaultKey())).toBeCloseTo(105, 6);
  });

  it('ignores the current session', async () => {
    const current = await train(0, 100);

    expect((await getPreviousBests(testDatabase.db, profileId, await view(current))).size).toBe(0);
  });

  it('ignores an unfinished session', async () => {
    await train(0, 90);
    await train(1, 120, { finish: false });
    const current = await train(2, 80);

    const bests = await getPreviousBests(testDatabase.db, profileId, await view(current));

    expect(bests.get(await defaultKey())).toBeCloseTo(105, 6);
  });

  it('ignores a session finished after the current one', async () => {
    const current = await train(0, 100);
    await train(1, 120);

    expect((await getPreviousBests(testDatabase.db, profileId, await view(current))).size).toBe(0);
  });

  it('keys a different variant separately', async () => {
    const { db } = testDatabase;
    const gymB = expectOk(await addVariant(db, profileId, pressId(), { name: 'Gym B' }, tick()));
    await train(0, 90, { variantId: gymB.id });
    const current = await train(1, 80);

    const bests = await getPreviousBests(db, profileId, await view(current));

    expect(bests.get(await defaultKey())).toBeUndefined();
    expect(bests.get(exerciseVariantKey(pressId(), gymB.id))).toBeCloseTo(105, 6);
  });

  it('leaves out an exercise whose previous session logged no weight', async () => {
    await train(0, null);
    const current = await train(1, 80);

    expect((await getPreviousBests(testDatabase.db, profileId, await view(current))).size).toBe(0);
  });
});
