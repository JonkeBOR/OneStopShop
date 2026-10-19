import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bodyPartIds } from '../domain/body-part';
import { linkBodyPart, listBodyParts, unlinkBodyPart } from './body-parts';
import { addExercise, archiveExercise, deleteExercise, getExerciseUsage } from './exercises';
import { ensureProfile } from './profile';
import { exerciseBodyParts } from './schema';
import { expectOk } from './storage-test-support';
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
    expectOk(await linkBodyPart(db, profileId, bench.id, 'triceps'));
    expectOk(await linkBodyPart(db, profileId, bench.id, 'chest'));
    expectOk(await linkBodyPart(db, profileId, bench.id, 'chest'));

    expect(await bodyPartsOf(bench.id)).toEqual(['chest', 'triceps']);
  });

  it('unlinks a body part and treats unlinking an unlinked one as done', async () => {
    const { db } = testDatabase;
    const row = expectOk(await addExercise(db, profileId, { name: 'Row' }, now));
    expectOk(await linkBodyPart(db, profileId, row.id, 'lats'));
    expectOk(await linkBodyPart(db, profileId, row.id, 'biceps'));

    expectOk(await unlinkBodyPart(db, profileId, row.id, 'lats'));
    expectOk(await unlinkBodyPart(db, profileId, row.id, 'lats'));

    expect(await bodyPartsOf(row.id)).toEqual(['biceps']);
  });

  it('links body parts to an archived exercise', async () => {
    const { db } = testDatabase;
    const curl = expectOk(await addExercise(db, profileId, { name: 'Curl' }, now));
    expectOk(await archiveExercise(db, profileId, curl.id, now));

    expectOk(await linkBodyPart(db, profileId, curl.id, 'biceps'));

    expect(await bodyPartsOf(curl.id)).toEqual(['biceps']);
  });

  it("refuses another profile's exercise and an unknown exercise", async () => {
    const { db } = testDatabase;
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const squat = expectOk(await addExercise(db, profileId, { name: 'Squat' }, now));
    expectOk(await linkBodyPart(db, profileId, squat.id, 'quads'));

    const notFound = { ok: false, error: 'not-found' };
    expect(await linkBodyPart(db, otherProfileId, squat.id, 'glutes')).toEqual(notFound);
    expect(await unlinkBodyPart(db, otherProfileId, squat.id, 'quads')).toEqual(notFound);
    expect(await linkBodyPart(db, profileId, crypto.randomUUID(), 'glutes')).toEqual(notFound);
    expect(await bodyPartsOf(squat.id)).toEqual(['quads']);
  });

  it('removes the links when the exercise is deleted', async () => {
    const { db } = testDatabase;
    const fly = expectOk(await addExercise(db, profileId, { name: 'Fly' }, now));
    expectOk(await linkBodyPart(db, profileId, fly.id, 'chest'));

    expectOk(await deleteExercise(db, profileId, fly.id));

    const links = await db
      .select()
      .from(exerciseBodyParts)
      .where(eq(exerciseBodyParts.exerciseId, fly.id));
    expect(links).toEqual([]);
  });
});
