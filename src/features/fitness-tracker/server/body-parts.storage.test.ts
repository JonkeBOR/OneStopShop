import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyPartIds } from '../domain/body-part';
import {
  linkBodyPart,
  listBodyParts,
  listProgramBodyPartLinks,
  unlinkBodyPart,
} from './body-parts';
import { addExercise, archiveExercise, deleteExercise, getExerciseUsage } from './exercises';
import { ensureProfile } from './profile';
import { exerciseBodyParts } from './schema';
import { createProgramFromSpec, expectOk } from './storage-test-support';
import { openTestDatabase, type TestDatabase } from './storage-test-database';

describe('body parts', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-19T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  async function bodyPartsOf(exerciseId: string) {
    return expectOk(await getExerciseUsage(testDatabase.db, profileId, exerciseId)).bodyParts;
  }

  it('is seeded with every muscle on the anatomy chart, each with a display name', async () => {
    const bodyParts = await listBodyParts(testDatabase.db);

    expect(bodyParts.map((bodyPart) => bodyPart.id)).toEqual(bodyPartIds);
    expect(bodyParts.find((bodyPart) => bodyPart.id === 'front-delts')).toEqual({
      id: 'front-delts',
      name: 'Front delts',
    });
  });

  it('links an exercise to body parts, and linking twice keeps one link', async () => {
    const { db } = testDatabase;
    const bench = expectOk(await addExercise(db, profileId, { name: 'Bench press' }, now));

    expect(await bodyPartsOf(bench.id)).toEqual([]);
    expectOk(await linkBodyPart(db, profileId, bench.id, 'triceps', 'secondary'));
    expectOk(await linkBodyPart(db, profileId, bench.id, 'chest', 'primary'));
    expectOk(await linkBodyPart(db, profileId, bench.id, 'chest', 'primary'));

    expect(await bodyPartsOf(bench.id)).toEqual([
      { bodyPart: 'chest', role: 'primary' },
      { bodyPart: 'triceps', role: 'secondary' },
    ]);
  });

  it('unlinks a body part and treats unlinking an unlinked one as done', async () => {
    const { db } = testDatabase;
    const row = expectOk(await addExercise(db, profileId, { name: 'Row' }, now));
    expectOk(await linkBodyPart(db, profileId, row.id, 'lats', 'primary'));
    expectOk(await linkBodyPart(db, profileId, row.id, 'biceps', 'primary'));

    expectOk(await unlinkBodyPart(db, profileId, row.id, 'lats'));
    expectOk(await unlinkBodyPart(db, profileId, row.id, 'lats'));

    expect(await bodyPartsOf(row.id)).toEqual([{ bodyPart: 'biceps', role: 'primary' }]);
  });

  it('links body parts to an archived exercise', async () => {
    const { db } = testDatabase;
    const curl = expectOk(await addExercise(db, profileId, { name: 'Curl' }, now));
    expectOk(await archiveExercise(db, profileId, curl.id, now));

    expectOk(await linkBodyPart(db, profileId, curl.id, 'biceps', 'primary'));

    expect(await bodyPartsOf(curl.id)).toEqual([{ bodyPart: 'biceps', role: 'primary' }]);
  });

  it("refuses another profile's exercise and an unknown exercise", async () => {
    const { db } = testDatabase;
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const squat = expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));
    expectOk(await linkBodyPart(db, profileId, squat.id, 'quads', 'primary'));

    const notFound = { ok: false, error: 'not-found' };
    expect(await linkBodyPart(db, otherProfileId, squat.id, 'glutes', 'primary')).toEqual(notFound);
    expect(await unlinkBodyPart(db, otherProfileId, squat.id, 'quads')).toEqual(notFound);
    expect(await linkBodyPart(db, profileId, crypto.randomUUID(), 'glutes', 'primary')).toEqual(
      notFound,
    );
    expect(await bodyPartsOf(squat.id)).toEqual([{ bodyPart: 'quads', role: 'primary' }]);
  });

  it('linking again with another role changes the role and keeps one link', async () => {
    const { db } = testDatabase;
    const dip = expectOk(await addExercise(db, profileId, { name: 'Dip' }, now));
    expectOk(await linkBodyPart(db, profileId, dip.id, 'triceps', 'primary'));

    expectOk(await linkBodyPart(db, profileId, dip.id, 'triceps', 'secondary'));

    expect(await bodyPartsOf(dip.id)).toEqual([{ bodyPart: 'triceps', role: 'secondary' }]);
  });

  it("lists the links of every exercise in a program's workouts, keyed by exercise", async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [
          { name: 'Push', slots: [{ exercise: 'Bench', targetReps: [10, 10] }] },
          {
            name: 'Pull',
            slots: [
              { exercise: 'Row', targetReps: [10] },
              { exercise: 'Bench', targetReps: [8] },
            ],
          },
        ],
      },
      now,
    );
    const idOf = (name: string) =>
      program.workouts
        .flatMap((workout) => workout.slots)
        .find((slot) => slot.exercise.name === name)?.exercise.id ?? '';
    const curl = expectOk(await addExercise(db, profileId, { name: 'Curl' }, now));
    expectOk(await linkBodyPart(db, profileId, idOf('Bench'), 'triceps', 'secondary'));
    expectOk(await linkBodyPart(db, profileId, idOf('Bench'), 'chest', 'primary'));
    expectOk(await linkBodyPart(db, profileId, idOf('Row'), 'lats', 'primary'));
    expectOk(await linkBodyPart(db, profileId, curl.id, 'biceps', 'primary'));

    const links = await listProgramBodyPartLinks(db, profileId, program.id);

    expect(links).toEqual(
      new Map([
        [
          idOf('Bench'),
          [
            { bodyPart: 'chest', role: 'primary' },
            { bodyPart: 'triceps', role: 'secondary' },
          ],
        ],
        [idOf('Row'), [{ bodyPart: 'lats', role: 'primary' }]],
      ]),
    );
  });

  it("lists no links for another profile's program", async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [{ name: 'Legs', slots: [{ exercise: 'Squat', targetReps: [5] }] }],
      },
      now,
    );
    const squatId = program.workouts[0]?.slots[0]?.exercise.id ?? '';
    expectOk(await linkBodyPart(db, profileId, squatId, 'quads', 'primary'));
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    expect(await listProgramBodyPartLinks(db, otherProfileId, program.id)).toEqual(new Map());
    expect(await listProgramBodyPartLinks(db, profileId, crypto.randomUUID())).toEqual(new Map());
  });

  it('removes the links when the exercise is deleted', async () => {
    const { db } = testDatabase;
    const fly = expectOk(await addExercise(db, profileId, { name: 'Fly' }, now));
    expectOk(await linkBodyPart(db, profileId, fly.id, 'chest', 'primary'));

    expectOk(await deleteExercise(db, profileId, fly.id));

    const links = await db
      .select()
      .from(exerciseBodyParts)
      .where(eq(exerciseBodyParts.exerciseId, fly.id));
    expect(links).toEqual([]);
  });
});
