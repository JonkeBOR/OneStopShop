import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateProgram } from './activation';
import {
  addExercise,
  archiveExercise,
  getExerciseUsage,
  listExercises,
  renameExercise,
  unarchiveExercise,
} from './exercises';
import { ensureProfile } from './profile';
import { exerciseSlots, exerciseVariants } from './schema';
import { createProgramFromSpec, defaultVariantOf, expectOk } from './storage-test-support';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import { logSet, startWorkout } from './training';
import { addVariant, listActiveVariants, removeVariant, renameVariant } from './variants';

describe('exercise catalog', () => {
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

  it('US1 scenario 1: adds an exercise and refuses the same name in another case or spacing', async () => {
    const { db } = testDatabase;
    const added = expectOk(await addExercise(db, profileId, { name: 'Incline bench press' }, now));
    expect(added).toMatchObject({ name: 'Incline bench press', isArchived: false });

    expect(await listExercises(db, profileId, { includeArchived: false })).toEqual([added]);

    const duplicate = await addExercise(db, profileId, { name: '  incline BENCH press ' }, now);
    expect(duplicate).toEqual({ ok: false, error: 'name-taken' });
    expect(await listExercises(db, profileId, { includeArchived: false })).toHaveLength(1);
  });

  it('a new exercise has one active variant named Default', async () => {
    const { db } = testDatabase;
    const added = expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));

    const variants = await listActiveVariants(db, [added.id]);

    expect(variants.get(added.id)).toEqual([
      { id: (await defaultVariantOf(db, added.id)).id, name: 'Default' },
    ]);
  });

  it('a refused exercise name creates no variant', async () => {
    const { db } = testDatabase;
    expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));
    const before = await db.select().from(exerciseVariants);

    const duplicate = await addExercise(db, profileId, { name: 'squat' }, now);

    expect(duplicate).toEqual({ ok: false, error: 'name-taken' });
    expect(await db.select().from(exerciseVariants)).toHaveLength(before.length);
  });

  it('allows the same name in different profiles', async () => {
    const { db } = testDatabase;
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));
    expectOk(await addExercise(db, otherProfileId, { name: 'Squat' }, now));
  });

  it('refuses an empty name and a name that is too long', async () => {
    const { db } = testDatabase;
    expect(await addExercise(db, profileId, { name: '   ' }, now)).toEqual({
      ok: false,
      error: 'name-required',
    });
    expect(await addExercise(db, profileId, { name: 'a'.repeat(101) }, now)).toEqual({
      ok: false,
      error: 'name-too-long',
    });
    expect(await listExercises(db, profileId, { includeArchived: true })).toEqual([]);
  });

  it('renames an exercise, refuses a name already taken, and allows a change of case', async () => {
    const { db } = testDatabase;
    const squat = expectOk(await addExercise(db, profileId, { name: 'squat' }, now));
    expectOk(await addExercise(db, profileId, { name: 'Deadlift' }, now));

    expect(await renameExercise(db, profileId, squat.id, { name: 'DEADLIFT' })).toEqual({
      ok: false,
      error: 'name-taken',
    });
    expect(expectOk(await renameExercise(db, profileId, squat.id, { name: 'Squat' })).name).toBe(
      'Squat',
    );
    expect(await renameExercise(db, profileId, 'missing', { name: 'Anything' })).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('archives and unarchives, hiding archived exercises unless asked for', async () => {
    const { db } = testDatabase;
    const press = expectOk(await addExercise(db, profileId, { name: 'Press' }, now));
    expectOk(await addExercise(db, profileId, { name: 'Row' }, now));

    const archived = expectOk(await archiveExercise(db, profileId, press.id, now));
    expect(archived.isArchived).toBe(true);
    expect(
      (await listExercises(db, profileId, { includeArchived: false })).map((item) => item.name),
    ).toEqual(['Row']);
    expect(
      (await listExercises(db, profileId, { includeArchived: true })).map((item) => item.name),
    ).toEqual(['Press', 'Row']);

    expect(expectOk(await unarchiveExercise(db, profileId, press.id)).isArchived).toBe(false);
  });

  it('lists exercises by name regardless of case', async () => {
    const { db } = testDatabase;
    for (const name of ['squat', 'Bench', 'deadlift']) {
      expectOk(await addExercise(db, profileId, { name }, now));
    }
    expect(
      (await listExercises(db, profileId, { includeArchived: false })).map((item) => item.name),
    ).toEqual(['Bench', 'deadlift', 'squat']);
  });
});

describe('exercise usage', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-03T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  it('US5 scenario 5, FR-036: lists the programs and workouts that use the exercise', async () => {
    const { db } = testDatabase;
    await createProgramFromSpec(
      db,
      profileId,
      {
        name: 'Strength',
        blockCount: 2,
        workouts: [
          { name: 'Upper', slots: [{ exercise: 'Press', targetReps: [5] }] },
          { name: 'Lower', slots: [{ exercise: 'Squat', targetReps: [5] }] },
        ],
      },
      now,
    );
    await createProgramFromSpec(
      db,
      profileId,
      {
        name: 'Cut',
        blockCount: 1,
        workouts: [{ name: 'Full body', slots: [{ exercise: 'Press', targetReps: [8] }] }],
      },
      new Date(now.getTime() + 1000),
    );
    const press = (await listExercises(db, profileId, { includeArchived: false })).find(
      (exercise) => exercise.name === 'Press',
    );

    const usage = expectOk(await getExerciseUsage(db, profileId, press?.id ?? ''));

    expect(usage.exercise).toEqual(press);
    expect(usage.slots.map((slot) => [slot.programName, slot.workoutName])).toEqual([
      ['Cut', 'Full body'],
      ['Strength', 'Upper'],
    ]);
    expect(usage.slots.every((slot) => slot.programId !== '' && slot.workoutId !== '')).toBe(true);
    expect(usage.hasSetLogs).toBe(false);
  });

  it('lists a workout once even when data from before the one-per-workout rule holds the exercise twice', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [{ name: 'Day', slots: [{ exercise: 'Curl', targetReps: [10] }] }],
      },
      now,
    );
    const workout = program.workouts[0];
    await db.insert(exerciseSlots).values({
      id: crypto.randomUUID(),
      workoutId: workout?.id ?? '',
      position: 2,
      exerciseId: workout?.slots[0]?.exercise.id ?? '',
      isOptional: false,
    });
    const curl = (await listExercises(db, profileId, { includeArchived: false }))[0];

    const usage = expectOk(await getExerciseUsage(db, profileId, curl?.id ?? ''));

    expect(usage.slots).toHaveLength(1);
  });

  it('FR-036: reports that the exercise has set logs once a set is logged', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [{ name: 'Day', slots: [{ exercise: 'Row', targetReps: [10] }] }],
      },
      now,
    );
    expectOk(await activateProgram(db, profileId, program.id, now));
    const session = expectOk(await startWorkout(db, profileId, program.workouts[0]?.id ?? '', now));
    expectOk(
      await logSet(
        db,
        profileId,
        session.id,
        session.slots[0]?.plannedSets[0]?.id ?? '',
        { reps: 10, weightKg: 50 },
        now,
      ),
    );

    const usage = expectOk(
      await getExerciseUsage(db, profileId, program.workouts[0]?.slots[0]?.exercise.id ?? ''),
    );

    expect(usage.hasSetLogs).toBe(true);
  });

  it('FR-036: an unused exercise has no slots and no set logs', async () => {
    const { db } = testDatabase;
    const exercise = expectOk(await addExercise(db, profileId, { name: 'Dips' }, now));

    expect(expectOk(await getExerciseUsage(db, profileId, exercise.id))).toEqual({
      exercise,
      slots: [],
      hasSetLogs: false,
      bodyParts: [],
      variants: [{ id: (await defaultVariantOf(db, exercise.id)).id, name: 'Default' }],
    });
  });

  it('getExerciseUsage lists active variants oldest first', async () => {
    const { db } = testDatabase;
    const exercise = expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));
    const barbell = expectOk(
      await renameVariant(
        db,
        profileId,
        exercise.id,
        (await defaultVariantOf(db, exercise.id)).id,
        {
          name: 'Barbell',
        },
      ),
    );
    const smith = expectOk(
      await addVariant(
        db,
        profileId,
        exercise.id,
        { name: 'Smith' },
        new Date(now.getTime() + 2000),
      ),
    );
    const goblet = expectOk(
      await addVariant(
        db,
        profileId,
        exercise.id,
        { name: 'Goblet' },
        new Date(now.getTime() + 1000),
      ),
    );
    const old = expectOk(
      await addVariant(db, profileId, exercise.id, { name: 'Old' }, new Date(now.getTime() + 500)),
    );
    expectOk(await removeVariant(db, profileId, exercise.id, old.id, now));

    const usage = expectOk(await getExerciseUsage(db, profileId, exercise.id));

    expect(usage.variants).toEqual([barbell, goblet, smith]);
  });

  it('answers not-found for an exercise of another profile or one that does not exist', async () => {
    const { db } = testDatabase;
    const exercise = expectOk(await addExercise(db, profileId, { name: 'Dips' }, now));
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    expect(await getExerciseUsage(db, otherProfileId, exercise.id)).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await getExerciseUsage(db, profileId, crypto.randomUUID())).toEqual({
      ok: false,
      error: 'not-found',
    });
  });
});
