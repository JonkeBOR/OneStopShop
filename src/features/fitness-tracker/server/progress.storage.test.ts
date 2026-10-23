import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateProgram } from './activation';
import { ensureProfile } from './profile';
import { workoutSessions } from './schema';
import { listAllVariants, listProgramSessions } from './progress';
import { deleteProgram } from './programs';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import {
  createProgramFromSpec,
  defaultVariantOf,
  expectOk,
  type ProgramSpec,
} from './storage-test-support';
import { finishWorkout, logSet, startWorkout } from './training';
import { addVariant, removeVariant, renameVariant } from './variants';

describe('reading program sessions and variants for progress charts', () => {
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

  const spec: ProgramSpec = {
    blockCount: 2,
    workouts: [{ name: 'Upper A', slots: [{ exercise: 'Seal row', targetReps: [10] }] }],
  };

  async function activate(forProfileId: string, name: string) {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(db, forProfileId, { ...spec, name }, tick());
    expectOk(await activateProgram(db, forProfileId, program.id, tick()));
    return program;
  }

  async function logWorkout(forProfileId: string, workoutId: string) {
    const { db } = testDatabase;
    const session = expectOk(await startWorkout(db, forProfileId, workoutId, tick()));
    for (const plannedSet of session.slots[0]?.plannedSets ?? []) {
      expectOk(
        await logSet(
          db,
          forProfileId,
          session.id,
          plannedSet.id,
          { reps: 10, weightKg: 50 },
          tick(),
        ),
      );
    }
    expectOk(await finishWorkout(db, forProfileId, session.id, tick()));
    return session;
  }

  it('listProgramSessions returns sessions in start order with program names', async () => {
    const { db } = testDatabase;
    const laterStart = clock + 86_400_000;
    const earlierStart = clock + 3_600_000;
    const insertedFirst = await activate(profileId, 'Inserted first');
    clock = laterStart;
    await logWorkout(profileId, insertedFirst.workouts[0]?.id ?? '');
    const insertedSecond = await activate(profileId, 'Inserted second');
    clock = earlierStart;
    await logWorkout(profileId, insertedSecond.workouts[0]?.id ?? '');

    const sessions = await listProgramSessions(db, profileId);

    expect(sessions.map((session) => [session.programId, session.programName])).toEqual([
      [insertedSecond.id, 'Inserted second'],
      [insertedFirst.id, 'Inserted first'],
    ]);
    expect(sessions.every((session) => !session.isDeleted)).toBe(true);
    expect(sessions[0]?.startedAt.getTime()).toBeLessThan(sessions[1]?.startedAt.getTime() ?? 0);
  });

  it("listProgramSessions marks a soft-deleted program's sessions as deleted and keeps its name", async () => {
    const { db } = testDatabase;
    const program = await activate(profileId, 'Doomed program');
    const session = await logWorkout(profileId, program.workouts[0]?.id ?? '');
    expectOk(await deleteProgram(db, profileId, program.id, tick()));

    const sessions = await listProgramSessions(db, profileId);

    expect(sessions).toEqual([
      {
        programId: program.id,
        programName: 'Doomed program',
        isDeleted: true,
        startedAt: session.startedAt,
      },
    ]);
  });

  it('listProgramSessions drops sessions whose program row no longer exists', async () => {
    const { db } = testDatabase;
    const program = await activate(profileId, 'Kept program');
    await logWorkout(profileId, program.workouts[0]?.id ?? '');
    await db.insert(workoutSessions).values({
      id: crypto.randomUUID(),
      profileId,
      programId: crypto.randomUUID(),
      cycleId: crypto.randomUUID(),
      pass: 1,
      trainingBlockId: crypto.randomUUID(),
      workoutId: crypto.randomUUID(),
      status: 'finished',
      startedAt: tick(),
      finishedAt: tick(),
    });

    const sessions = await listProgramSessions(db, profileId);

    expect(sessions.map((session) => session.programId)).toEqual([program.id]);
  });

  it("listProgramSessions only returns the profile's own sessions", async () => {
    const { db } = testDatabase;
    const mine = await activate(profileId, 'My program');
    await logWorkout(profileId, mine.workouts[0]?.id ?? '');
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), tick())).id;
    const theirs = await activate(otherProfileId, 'Their program');
    await logWorkout(otherProfileId, theirs.workouts[0]?.id ?? '');

    const sessions = await listProgramSessions(db, profileId);

    expect(sessions.map((session) => session.programName)).toEqual(['My program']);
  });

  it('listAllVariants includes retired variants and nothing from another profile', async () => {
    const { db } = testDatabase;
    const program = await activate(profileId, 'Variant program');
    const exerciseId = program.workouts[0]?.slots[0]?.exercise.id ?? '';
    const gymA = expectOk(
      await renameVariant(db, profileId, exerciseId, (await defaultVariantOf(db, exerciseId)).id, {
        name: 'Gym A',
      }),
    );
    const gymB = expectOk(await addVariant(db, profileId, exerciseId, { name: 'Gym B' }, tick()));
    await logWorkout(profileId, program.workouts[0]?.id ?? '');
    const removal = expectOk(await removeVariant(db, profileId, exerciseId, gymA.id, tick()));
    expect(removal.removal).toBe('retire');
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), tick())).id;

    expect(await listAllVariants(db, profileId, exerciseId)).toEqual([
      { id: gymA.id, name: 'Gym A', isRetired: true },
      { id: gymB.id, name: 'Gym B', isRetired: false },
    ]);
    expect(await listAllVariants(db, otherProfileId, exerciseId)).toEqual([]);
  });
});
