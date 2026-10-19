import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addExercise, getExerciseUsage, listExercises } from '../exercises';
import { ensureProfile } from '../profile';
import { openTestDatabase, type TestDatabase } from '../storage-test-database';
import { createProgramFromSpec, expectOk } from '../storage-test-support';
import {
  handleAddExercise,
  handleDeleteExercise,
  handleLinkBodyPart,
  handleUnlinkBodyPart,
  handleUpdateExercise,
} from './exercises';
import { handlerContext, jsonOf } from './handler-test-support';

describe('exercise handlers', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-03T08:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  function add(body: unknown) {
    return handleAddExercise(handlerContext({ db: testDatabase.db, profileId, now, body }));
  }

  it('US5 scenario 1: adds an exercise and answers it', async () => {
    const response = await add({ name: 'Seal rows' });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({ name: 'Seal rows', isArchived: false });
    const names = (await listExercises(testDatabase.db, profileId, { includeArchived: true })).map(
      (exercise) => exercise.name,
    );
    expect(names).toEqual(['Seal rows']);
  });

  it('answers 400 name-required for a blank name', async () => {
    const response = await add({ name: '   ' });

    expect(response.status).toBe(400);
    expect(await jsonOf(response)).toEqual({ error: 'name-required' });
  });

  it('US5 scenario 2: answers 409 name-taken for the same name in another case with spaces', async () => {
    await add({ name: 'Chins' });

    const response = await add({ name: 'chins ' });

    expect(response.status).toBe(409);
    expect(await jsonOf(response)).toEqual({ error: 'name-taken' });
  });

  it('answers 400 invalid-body when the name is missing', async () => {
    const response = await add({});

    expect(response.status).toBe(400);
    expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
  });

  describe('updating', () => {
    async function exercise(name: string) {
      return expectOk(await addExercise(testDatabase.db, profileId, { name }, now));
    }

    function update(id: string, body: unknown) {
      return handleUpdateExercise(
        handlerContext({ db: testDatabase.db, profileId, now, body, params: { id } }),
      );
    }

    it('renames an exercise and answers it', async () => {
      const dips = await exercise('Dips');

      const response = await update(dips.id, { name: 'Weighted dips' });

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ ...dips, name: 'Weighted dips' });
    });

    it('US5 scenario 2: refuses a name another exercise has, ignoring case', async () => {
      await exercise('Chins');
      const dips = await exercise('Dips');

      const response = await update(dips.id, { name: 'CHINS' });

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'name-taken' });
    });

    it('answers 400 name-required for a blank name', async () => {
      const dips = await exercise('Dips');

      expect(await jsonOf(await update(dips.id, { name: ' ' }))).toEqual({
        error: 'name-required',
      });
    });

    it('US5 scenario 4: archives and unarchives an exercise', async () => {
      const dips = await exercise('Dips');

      const archived = await update(dips.id, { isArchived: true });
      expect(await jsonOf(archived)).toMatchObject({ isArchived: true });
      expect(await listExercises(testDatabase.db, profileId, { includeArchived: false })).toEqual(
        [],
      );

      const restored = await update(dips.id, { isArchived: false });
      expect(await jsonOf(restored)).toMatchObject({ isArchived: false });
    });

    it('answers 404 for an exercise that does not exist', async () => {
      const response = await update(crypto.randomUUID(), { name: 'X' });

      expect(response.status).toBe(404);
    });

    it('answers 400 invalid-body when it is given neither a name nor an archived flag', async () => {
      const dips = await exercise('Dips');

      const response = await update(dips.id, {});

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });
  });

  describe('deleting', () => {
    function remove(id: string) {
      return handleDeleteExercise(
        handlerContext({ db: testDatabase.db, profileId, now, params: { id } }),
      );
    }

    it('deletes an exercise that nothing uses', async () => {
      const dips = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Dips' }, now));

      const response = await remove(dips.id);

      expect(response.status).toBe(200);
      expect(await listExercises(testDatabase.db, profileId, { includeArchived: true })).toEqual(
        [],
      );
    });

    it('US5 scenario 3: refuses to delete an exercise used in a workout', async () => {
      const program = await createProgramFromSpec(
        testDatabase.db,
        profileId,
        {
          blockCount: 1,
          workouts: [{ name: 'Day', slots: [{ exercise: 'Row', targetReps: [8] }] }],
        },
        now,
      );

      const response = await remove(program.workouts[0]?.slots[0]?.exercise.id ?? '');

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'exercise-in-use' });
    });

    it('answers 404 for an exercise of another profile', async () => {
      const dips = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Dips' }, now));
      const otherProfileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;

      const response = await handleDeleteExercise(
        handlerContext({
          db: testDatabase.db,
          profileId: otherProfileId,
          now,
          params: { id: dips.id },
        }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('body parts', () => {
    function linkWith(body: unknown, id: string, bodyPart: string) {
      return handleLinkBodyPart(
        handlerContext({ db: testDatabase.db, profileId, now, body, params: { id, bodyPart } }),
      );
    }

    function link(id: string, bodyPart: string) {
      return linkWith({ role: 'primary' }, id, bodyPart);
    }

    function unlink(id: string, bodyPart: string) {
      return handleUnlinkBodyPart(
        handlerContext({ db: testDatabase.db, profileId, now, params: { id, bodyPart } }),
      );
    }

    async function bodyPartsOf(id: string) {
      return expectOk(await getExerciseUsage(testDatabase.db, profileId, id)).bodyParts;
    }

    it('links and unlinks a body part, answering an empty body each time', async () => {
      const press = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Press' }, now));

      const linked = await link(press.id, 'front-delts');
      expect(linked.status).toBe(200);
      expect(await jsonOf(linked)).toEqual({});
      expect(await bodyPartsOf(press.id)).toEqual([{ bodyPart: 'front-delts', role: 'primary' }]);

      const unlinked = await unlink(press.id, 'front-delts');
      expect(unlinked.status).toBe(200);
      expect(await jsonOf(unlinked)).toEqual({});
      expect(await bodyPartsOf(press.id)).toEqual([]);
    });

    it('links a body part with the role it is given', async () => {
      const press = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Press' }, now));

      const response = await linkWith({ role: 'secondary' }, press.id, 'triceps');

      expect(response.status).toBe(200);
      expect(await bodyPartsOf(press.id)).toEqual([{ bodyPart: 'triceps', role: 'secondary' }]);
    });

    it('answers 400 invalid-body when the role is missing or not a role', async () => {
      const press = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Press' }, now));

      for (const body of [undefined, {}, { role: 'tertiary' }, { role: 1 }]) {
        const response = await linkWith(body, press.id, 'chest');
        expect(response.status).toBe(400);
        expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
      }
      expect(await bodyPartsOf(press.id)).toEqual([]);
    });

    it('answers 404 for a body part that is not on the chart', async () => {
      const press = expectOk(await addExercise(testDatabase.db, profileId, { name: 'Press' }, now));

      for (const response of [await link(press.id, 'neck'), await unlink(press.id, 'neck')]) {
        expect(response.status).toBe(404);
        expect(await jsonOf(response)).toEqual({ error: 'not-found' });
      }
    });

    it('answers 404 for an exercise that does not exist', async () => {
      const response = await link(crypto.randomUUID(), 'chest');

      expect(response.status).toBe(404);
    });
  });
});
