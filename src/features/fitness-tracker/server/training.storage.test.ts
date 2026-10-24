import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Program, SessionView } from '../domain/types';
import { activateProgram } from './activation';
import { ensureProfile } from './profile';
import { getProgram } from './programs';
import { cycles, plannedSets, plannedSetVariantWeights, setLogs } from './schema';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import {
  createProgramFromSpec,
  defaultVariantOf,
  expectOk,
  type ProgramSpec,
} from './storage-test-support';
import {
  countEarlierSessionsThisWeek,
  finishWorkout,
  getSession,
  getSessionSlotSettings,
  getTrainingOverview,
  logSet,
  startWorkout,
} from './training';
import { addVariant, removeVariant, renameVariant, switchSlotVariant } from './variants';

describe('training', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-02T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  async function activeProgram(spec: ProgramSpec): Promise<Program> {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, profileId, spec, now);
    expectOk(await activateProgram(db, profileId, program.id, now));
    return program;
  }

  async function open(workoutId: string): Promise<SessionView> {
    return expectOk(await startWorkout(testDatabase.db, profileId, workoutId, now));
  }

  async function lastWeights(programId: string): Promise<(number | null)[][]> {
    const program = expectOk(await getProgram(testDatabase.db, profileId, programId));
    return program.workouts.flatMap((workout) =>
      workout.slots.flatMap((slot) =>
        slot.prescriptions.map((prescription) =>
          prescription.plannedSets.map((plannedSet) => plannedSet.lastWeightKg),
        ),
      ),
    );
  }

  const fourWorkouts: ProgramSpec = {
    blockCount: 2,
    workouts: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((name) => ({
      name,
      slots: [{ exercise: `${name} lift`, targetReps: [10, 10] }],
    })),
  };

  it('US2 scenario 2, rule 14: a slot that was never logged shows targets and no suggested weight', async () => {
    const program = await activeProgram({
      blockCount: 2,
      workouts: [
        { name: 'Upper A', slots: [{ exercise: 'Row', targetReps: [12, 10, 8] }] },
        { name: 'Lower A', slots: [] },
      ],
    });

    const session = await open(program.workouts[0]?.id ?? '');

    expect(session.status).toBe('in_progress');
    expect(session.block).toEqual({ id: program.blocks[0]?.id, number: 1, label: null });
    expect(
      session.slots[0]?.plannedSets.map((set) => [
        set.setNumber,
        set.targetReps,
        set.suggestedWeightKg,
      ]),
    ).toEqual([
      [1, 12, null],
      [2, 10, null],
      [3, 8, null],
    ]);
  });

  it('US2 scenario 3, rule 11: finishing without logging creates no set log and keeps last weight', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const slot = program.workouts[0]?.slots[0];
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 20000 })
      .where(eq(plannedSets.exerciseSlotId, slot?.id ?? ''));
    const session = await open(program.workouts[0]?.id ?? '');
    expect(session.slots[0]?.plannedSets.map((set) => set.suggestedWeightKg)).toEqual([20, 20]);

    expectOk(await finishWorkout(db, profileId, session.id, now));

    expect(await db.select().from(setLogs).where(eq(setLogs.profileId, profileId))).toEqual([]);
    const weights = await lastWeights(program.id);
    expect(weights[0]).toEqual([20, 20]);
    expect(weights[1]).toEqual([20, 20]);
  });

  it('US2 scenario 4, rules 15 and 16: logging records the set with its context and updates only that planned set', async () => {
    const { db } = testDatabase;
    const program = await activeProgram({
      blockCount: 2,
      workouts: [
        { name: 'Upper A', slots: [{ exercise: 'Incline bench press', targetReps: [12, 12, 12] }] },
        { name: 'Upper B', slots: [{ exercise: 'Incline bench press', targetReps: [12, 12, 12] }] },
      ],
    });
    const upperA = program.workouts[0];
    const { cycle } = expectOk(await getProgram(db, profileId, program.id));
    const session = await open(upperA?.id ?? '');
    const targetSet = session.slots[0]?.plannedSets[1];

    const logged = expectOk(
      await logSet(db, profileId, session.id, targetSet?.id ?? '', { reps: 10, weightKg: 40 }, now),
    );

    expect(logged).toMatchObject({
      exerciseId: upperA?.slots[0]?.exercise.id,
      performedAt: now,
      setNumber: 2,
      reps: 10,
      weightKg: 40,
    });
    expect(logged.context).toEqual({
      programId: program.id,
      cycleId: cycle.id,
      pass: 1,
      trainingBlockId: program.blocks[0]?.id,
      blockNumber: 1,
      workoutId: upperA?.id,
      exerciseSlotId: upperA?.slots[0]?.id,
      workoutSessionId: session.id,
    });
    expect(await lastWeights(program.id)).toEqual([
      [null, 40, null],
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    expect(
      await db.select().from(setLogs).where(eq(setLogs.workoutSessionId, session.id)),
    ).toHaveLength(1);
  });

  it('US2 scenario 5: a bodyweight set is logged without weight and clears the last weight', async () => {
    const { db } = testDatabase;
    const program = await activeProgram({
      blockCount: 1,
      workouts: [
        { name: 'Pull', slots: [{ exercise: 'Chin-up', targetReps: [8, 8] }] },
        { name: 'Push', slots: [] },
      ],
    });
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 10000 })
      .where(eq(plannedSets.exerciseSlotId, program.workouts[0]?.slots[0]?.id ?? ''));
    const session = await open(program.workouts[0]?.id ?? '');

    const logged = expectOk(
      await logSet(
        db,
        profileId,
        session.id,
        session.slots[0]?.plannedSets[0]?.id ?? '',
        { reps: 8 },
        now,
      ),
    );

    expect(logged.weightKg).toBeNull();
    expect((await lastWeights(program.id))[0]).toEqual([null, 10]);
  });

  it('US2 scenario 6, rule 10: suggests the first unfinished workout and lets any unfinished one start', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const [upperA, lowerA, upperB, lowerB] = program.workouts;

    for (const workout of [upperA, lowerA]) {
      const session = await open(workout?.id ?? '');
      expectOk(await finishWorkout(db, profileId, session.id, now));
    }

    const overview = await getTrainingOverview(db, profileId);
    expect(overview?.suggestedWorkoutId).toBe(upperB?.id);
    expect(overview?.workouts.map((workout) => workout.status)).toEqual([
      'finished',
      'finished',
      'not-started',
      'not-started',
    ]);
    expect(overview?.currentBlock).toMatchObject({ number: 1, label: null, isLast: false });
    expect(overview?.blocks).toHaveLength(2);
    expect((await open(lowerB?.id ?? '')).status).toBe('in_progress');
    expect((await getTrainingOverview(db, profileId))?.workouts[3]?.status).toBe('in-progress');
  });

  it('US2 scenario 7, rule 12: a workout can be finished with no sets logged', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const session = await open(program.workouts[0]?.id ?? '');

    expect(expectOk(await finishWorkout(db, profileId, session.id, now))).toMatchObject({
      progression: 'none',
    });

    const finished = expectOk(await getSession(db, profileId, session.id));
    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toEqual(now);
  });

  it('starting a workout that is already in progress resumes the same session', async () => {
    const program = await activeProgram(fourWorkouts);
    const first = await open(program.workouts[0]?.id ?? '');
    const second = await open(program.workouts[0]?.id ?? '');
    expect(second.id).toBe(first.id);
  });

  it('refuses to start a workout that is already finished in this block', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const workoutId = program.workouts[0]?.id ?? '';
    expectOk(await finishWorkout(db, profileId, (await open(workoutId)).id, now));

    expect(await startWorkout(db, profileId, workoutId, now)).toEqual({
      ok: false,
      error: 'workout-already-finished',
    });
  });

  it('refuses to log into a finished session', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const session = await open(program.workouts[0]?.id ?? '');
    expectOk(await finishWorkout(db, profileId, session.id, now));

    expect(
      await logSet(
        db,
        profileId,
        session.id,
        session.slots[0]?.plannedSets[0]?.id ?? '',
        { reps: 5 },
        now,
      ),
    ).toEqual({ ok: false, error: 'session-not-in-progress' });
    expect(await finishWorkout(db, profileId, session.id, now)).toEqual({
      ok: false,
      error: 'session-not-in-progress',
    });
  });

  it('refuses to log a planned set that belongs to another workout or another block', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const session = await open(program.workouts[0]?.id ?? '');
    const otherWorkoutSet =
      (await open(program.workouts[1]?.id ?? '')).slots[0]?.plannedSets[0]?.id ?? '';
    const otherBlockSet =
      (
        await db
          .select({ id: plannedSets.id })
          .from(plannedSets)
          .where(
            and(
              eq(plannedSets.exerciseSlotId, program.workouts[0]?.slots[0]?.id ?? ''),
              eq(plannedSets.trainingBlockId, program.blocks[1]?.id ?? ''),
              eq(plannedSets.setNumber, 1),
            ),
          )
      )[0]?.id ?? '';

    for (const plannedSetId of [otherWorkoutSet, otherBlockSet]) {
      expect(await logSet(db, profileId, session.id, plannedSetId, { reps: 5 }, now)).toEqual({
        ok: false,
        error: 'planned-set-not-in-session',
      });
    }
    expect(await db.select().from(setLogs).where(eq(setLogs.profileId, profileId))).toEqual([]);
  });

  it('refuses invalid reps and weights without saving anything', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const session = await open(program.workouts[0]?.id ?? '');
    const plannedSetId = session.slots[0]?.plannedSets[0]?.id ?? '';

    expect(await logSet(db, profileId, session.id, plannedSetId, { reps: 0 }, now)).toEqual({
      ok: false,
      error: 'invalid-reps',
    });
    expect(
      await logSet(db, profileId, session.id, plannedSetId, { reps: 5, weightKg: -2 }, now),
    ).toEqual({
      ok: false,
      error: 'invalid-weight',
    });
    expect(await db.select().from(setLogs).where(eq(setLogs.profileId, profileId))).toEqual([]);
  });

  it('logging the same planned set twice makes two set logs and the later weight wins', async () => {
    const { db } = testDatabase;
    const program = await activeProgram(fourWorkouts);
    const session = await open(program.workouts[0]?.id ?? '');
    const plannedSetId = session.slots[0]?.plannedSets[0]?.id ?? '';

    expectOk(
      await logSet(db, profileId, session.id, plannedSetId, { reps: 10, weightKg: 50 }, now),
    );
    expectOk(
      await logSet(db, profileId, session.id, plannedSetId, { reps: 9, weightKg: 52.5 }, now),
    );

    const viewed = expectOk(await getSession(db, profileId, session.id));
    expect(viewed.slots[0]?.loggedSets.map((log) => log.weightKg)).toEqual([50, 52.5]);
    expect((await lastWeights(program.id))[0]).toEqual([52.5, null]);
  });

  it('a workout with no exercise slots can be started and finished', async () => {
    const { db } = testDatabase;
    const program = await activeProgram({
      blockCount: 1,
      workouts: [
        { name: 'Rest day', slots: [] },
        { name: 'Pull', slots: [{ exercise: 'Row', targetReps: [10] }] },
      ],
    });
    const session = await open(program.workouts[0]?.id ?? '');
    expect(session.slots).toEqual([]);
    expect(expectOk(await finishWorkout(db, profileId, session.id, now))).toMatchObject({
      progression: 'none',
    });
  });

  it('rule 3, FR-045: activating a program makes it active on its first block, in its first pass', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, profileId, fourWorkouts, now);

    const cycle = expectOk(await activateProgram(db, profileId, program.id, now));

    expect(cycle).toMatchObject({ currentBlockId: program.blocks[0]?.id, pass: 1 });
    expect(expectOk(await getProgram(db, profileId, program.id)).isActive).toBe(true);
  });

  it('activating the program that is already active changes nothing and starts no new cycle', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, profileId, fourWorkouts, now);
    const first = expectOk(await activateProgram(db, profileId, program.id, now));
    const again = expectOk(
      await activateProgram(db, profileId, program.id, new Date('2026-10-09T10:00:00Z')),
    );

    expect(again).toEqual(first);
    expect(await db.select().from(cycles).where(eq(cycles.programId, program.id))).toHaveLength(1);
  });

  it('refuses to activate a program that has no workouts or a slot without planned sets', async () => {
    const { db } = testDatabase;
    const empty = await createProgramFromSpec(db, profileId, { blockCount: 2, workouts: [] }, now);
    expect(await activateProgram(db, profileId, empty.id, now)).toEqual({
      ok: false,
      error: 'program-incomplete',
    });
    expect(expectOk(await getProgram(db, profileId, empty.id)).isActive).toBe(false);
    expect(await activateProgram(db, profileId, 'missing', now)).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('refuses to start a workout when no program is active or the workout is not in the active program', async () => {
    const { db } = testDatabase;
    const other = await createProgramFromSpec(db, profileId, fourWorkouts, now);
    expect(await startWorkout(db, profileId, other.workouts[0]?.id ?? '', now)).toEqual({
      ok: false,
      error: 'no-active-program',
    });

    await activeProgram({ ...fourWorkouts, name: 'Active one' });
    expect(await startWorkout(db, profileId, other.workouts[0]?.id ?? '', now)).toEqual({
      ok: false,
      error: 'workout-not-in-active-program',
    });
    expect(await getTrainingOverview(db, crypto.randomUUID())).toBeNull();
  });

  describe('with exercise variants', () => {
    const later = new Date('2026-10-02T11:00:00Z');

    async function variantSession() {
      const { db } = testDatabase;
      const program = await activeProgram({
        blockCount: 2,
        workouts: [
          {
            name: 'Lower A',
            slots: [
              { exercise: 'Squat', targetReps: [5, 5] },
              { exercise: 'Curl', targetReps: [10] },
            ],
          },
          { name: 'Upper A', slots: [{ exercise: 'Bench', targetReps: [8] }] },
        ],
      });
      const slot = program.workouts[0]?.slots[0];
      const exerciseId = slot?.exercise.id ?? '';
      const barbell = expectOk(
        await renameVariant(
          db,
          profileId,
          exerciseId,
          (await defaultVariantOf(db, exerciseId)).id,
          {
            name: 'Barbell',
          },
        ),
      );
      const smith = expectOk(await addVariant(db, profileId, exerciseId, { name: 'Smith' }, later));
      const session = await open(program.workouts[0]?.id ?? '');
      return {
        slotId: slot?.id ?? '',
        exercise: slot?.exercise,
        otherWorkoutSlotId: program.workouts[1]?.slots[0]?.id ?? '',
        barbell,
        smith,
        session,
      };
    }

    it('getSession gives each slot its selected variant', async () => {
      const { db } = testDatabase;
      const { slotId, barbell, session } = await variantSession();

      const view = expectOk(await getSession(db, profileId, session.id));

      expect(view.slots.find((slot) => slot.id === slotId)?.variant).toEqual(barbell);
    });

    it('getSession offers a variant choice only for an exercise with several active variants', async () => {
      const { db } = testDatabase;
      const program = await activeProgram({
        blockCount: 1,
        workouts: [{ name: 'Lower A', slots: [{ exercise: 'Squat', targetReps: [5] }] }],
      });
      const slot = program.workouts[0]?.slots[0];
      const exerciseId = slot?.exercise.id ?? '';
      const session = await open(program.workouts[0]?.id ?? '');
      const slotView = async () => expectOk(await getSession(db, profileId, session.id)).slots[0];

      expect(await slotView()).toMatchObject({
        hasVariantChoice: false,
        variant: { name: 'Default' },
      });

      const gymB = expectOk(await addVariant(db, profileId, exerciseId, { name: 'Gym B' }, later));
      expect((await slotView())?.hasVariantChoice).toBe(true);

      expectOk(
        await switchSlotVariant(db, profileId, session.id, slot?.id ?? '', { variantId: gymB.id }),
      );
      expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 30 },
          now,
        ),
      );
      expectOk(await removeVariant(db, profileId, exerciseId, gymB.id, later));

      expect(await slotView()).toMatchObject({
        hasVariantChoice: false,
        variant: { name: 'Default' },
      });
    });

    it('getSessionSlotSettings lists the active variants oldest first, the selection and the block’s planned sets', async () => {
      const { db } = testDatabase;
      const { slotId, exercise, barbell, smith, session } = await variantSession();

      const settings = expectOk(await getSessionSlotSettings(db, profileId, session.id, slotId));

      expect(settings).toEqual({
        sessionId: session.id,
        status: 'in_progress',
        exercise,
        plannedSetIds: session.slots[0]?.plannedSets.map((plannedSet) => plannedSet.id),
        variants: [barbell, smith],
        selectedVariantId: barbell.id,
        isLocked: false,
      });
    });

    it('getSessionSlotSettings is locked once a set of the slot is logged in the session', async () => {
      const { db } = testDatabase;
      const { slotId, session } = await variantSession();
      expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 40 },
          now,
        ),
      );

      const settings = expectOk(await getSessionSlotSettings(db, profileId, session.id, slotId));

      expect(settings.isLocked).toBe(true);
    });

    it('getSessionSlotSettings answers not-found for another profile, another workout’s slot or an unknown slot', async () => {
      const { db } = testDatabase;
      const { slotId, otherWorkoutSlotId, session } = await variantSession();
      const intruderId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

      expect(await getSessionSlotSettings(db, intruderId, session.id, slotId)).toEqual({
        ok: false,
        error: 'not-found',
      });
      expect(await getSessionSlotSettings(db, profileId, session.id, otherWorkoutSlotId)).toEqual({
        ok: false,
        error: 'not-found',
      });
      expect(await getSessionSlotSettings(db, profileId, session.id, crypto.randomUUID())).toEqual({
        ok: false,
        error: 'not-found',
      });
    });

    it('logSet records the slot’s selected variant on the set log', async () => {
      const { db } = testDatabase;
      const { barbell, session } = await variantSession();

      const logged = expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 40 },
          now,
        ),
      );

      expect(logged.variantId).toBe(barbell.id);
      const [stored] = await db.select().from(setLogs).where(eq(setLogs.id, logged.id));
      expect(stored?.variantId).toBe(barbell.id);
    });

    it('logSet records the variant the slot was switched to', async () => {
      const { db } = testDatabase;
      const { slotId, smith, session } = await variantSession();
      expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));

      const logged = expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 30 },
          now,
        ),
      );

      expect(logged.variantId).toBe(smith.id);
    });

    it('logSet updates only the selected variant’s weight', async () => {
      const { db } = testDatabase;
      const { slotId, barbell, smith, session } = await variantSession();
      await db
        .update(plannedSets)
        .set({ lastWeightGrams: 40000 })
        .where(eq(plannedSets.exerciseSlotId, slotId));
      expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));
      await db
        .update(plannedSets)
        .set({ lastWeightGrams: 30000 })
        .where(eq(plannedSets.exerciseSlotId, slotId));
      const target = session.slots[0]?.plannedSets[0]?.id ?? '';

      expectOk(await logSet(db, profileId, session.id, target, { reps: 5, weightKg: 32.5 }, now));

      const [updated] = await db.select().from(plannedSets).where(eq(plannedSets.id, target));
      expect(updated?.variantId).toBe(smith.id);
      expect(updated?.lastWeightGrams).toBe(32500);
      const parked = await db
        .select()
        .from(plannedSetVariantWeights)
        .where(
          and(
            eq(plannedSetVariantWeights.plannedSetId, target),
            eq(plannedSetVariantWeights.variantId, barbell.id),
          ),
        );
      expect(parked.map((row) => row.lastWeightGrams)).toEqual([40000]);
    });

    it('logSet refuses a set meant for a variant the slot was switched away from, writing nothing', async () => {
      const { db } = testDatabase;
      const { slotId, barbell, smith, session } = await variantSession();
      await db
        .update(plannedSets)
        .set({ lastWeightGrams: 40000 })
        .where(eq(plannedSets.exerciseSlotId, slotId));
      expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));
      const plannedBefore = await db
        .select()
        .from(plannedSets)
        .where(eq(plannedSets.exerciseSlotId, slotId));
      const parkedBefore = await db.select().from(plannedSetVariantWeights);

      expect(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 40, expectedVariantId: barbell.id },
          now,
        ),
      ).toEqual({ ok: false, error: 'variant-changed' });

      expect(await db.select().from(setLogs).where(eq(setLogs.profileId, profileId))).toEqual([]);
      expect(
        await db.select().from(plannedSets).where(eq(plannedSets.exerciseSlotId, slotId)),
      ).toEqual(plannedBefore);
      expect(await db.select().from(plannedSetVariantWeights)).toEqual(parkedBefore);
    });

    it('logSet logs a set meant for the variant the slot shows', async () => {
      const { db } = testDatabase;
      const { slotId, smith, session } = await variantSession();
      expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));
      const target = session.slots[0]?.plannedSets[0]?.id ?? '';

      const logged = expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          target,
          { reps: 5, weightKg: 30, expectedVariantId: smith.id },
          now,
        ),
      );

      expect(logged.variantId).toBe(smith.id);
      const [updated] = await db.select().from(plannedSets).where(eq(plannedSets.id, target));
      expect(updated?.lastWeightGrams).toBe(30000);
    });
  });
});

describe('sessions finished earlier in the week', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  let program: Program;

  const eightWorkouts: ProgramSpec = {
    blockCount: 1,
    workouts: Array.from({ length: 8 }, (_, index) => ({
      name: `Day ${index + 1}`,
      slots: [{ exercise: 'Press', targetReps: [5] }],
    })),
  };

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  async function activeProgramFor(profile: string): Promise<Program> {
    const { db } = testDatabase;
    const created = await createProgramFromSpec(
      db,
      profile,
      eightWorkouts,
      new Date('2026-10-01T08:00:00Z'),
    );
    expectOk(await activateProgram(db, profile, created.id, new Date('2026-10-01T08:00:00Z')));
    return created;
  }

  beforeEach(async () => {
    profileId = (
      await ensureProfile(testDatabase.db, crypto.randomUUID(), new Date('2026-10-01T08:00:00Z'))
    ).id;
    program = await activeProgramFor(profileId);
  });

  async function train(
    index: number,
    finishedAt: string,
    options: { finish?: boolean; profile?: string; workouts?: Program } = {},
  ): Promise<string> {
    const { db } = testDatabase;
    const profile = options.profile ?? profileId;
    const workoutId = (options.workouts ?? program).workouts[index]?.id ?? '';
    const finished = new Date(finishedAt);
    const session = expectOk(
      await startWorkout(db, profile, workoutId, new Date(finished.getTime() - 3_600_000)),
    );
    if (options.finish ?? true) {
      expectOk(await finishWorkout(db, profile, session.id, finished));
    }
    return session.id;
  }

  async function countFor(sessionId: string): Promise<number> {
    const { db } = testDatabase;
    const session = expectOk(await getSession(db, profileId, sessionId));
    return countEarlierSessionsThisWeek(db, profileId, session);
  }

  it('counts the sessions finished earlier in the same week', async () => {
    await train(0, '2026-10-19T09:00:00Z');
    await train(1, '2026-10-20T09:00:00Z');
    await train(2, '2026-10-21T09:00:00Z');
    const current = await train(3, '2026-10-22T09:00:00Z');

    expect(await countFor(current)).toBe(3);
  });

  it('does not count sessions from last week', async () => {
    await train(0, '2026-10-18T23:59:00Z');
    const current = await train(1, '2026-10-19T00:30:00Z');

    expect(await countFor(current)).toBe(0);
  });

  it('does not count sessions finished later, so a reload keeps its position', async () => {
    await train(0, '2026-10-19T09:00:00Z');
    const current = await train(1, '2026-10-20T09:00:00Z');
    await train(2, '2026-10-21T09:00:00Z');

    expect(await countFor(current)).toBe(1);
  });

  it('does not count unfinished sessions or other profiles', async () => {
    const otherProfileId = (
      await ensureProfile(testDatabase.db, crypto.randomUUID(), new Date('2026-10-01T08:00:00Z'))
    ).id;
    const otherProgram = await activeProgramFor(otherProfileId);
    await train(0, '2026-10-19T09:00:00Z', { profile: otherProfileId, workouts: otherProgram });
    await train(1, '2026-10-20T09:00:00Z', { finish: false });
    const current = await train(2, '2026-10-21T09:00:00Z');

    expect(await countFor(current)).toBe(0);
  });
});
