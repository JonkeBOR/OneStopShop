import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateProgram } from '../activation';
import { ensureProfile } from '../profile';
import { openTestDatabase, type TestDatabase } from '../storage-test-database';
import { createProgramFromSpec, expectOk } from '../storage-test-support';
import { logSet, startWorkout } from '../training';
import { addVariant } from '../variants';
import { handlerContext, jsonOf } from './handler-test-support';
import { handleAddVariant, handleRemoveVariant, handleSwitchVariant } from './variants';

describe('variant handlers', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-20T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  async function squatProgram() {
    const program = await createProgramFromSpec(
      testDatabase.db,
      profileId,
      {
        blockCount: 1,
        workouts: [{ name: 'Day', slots: [{ exercise: 'Squat', targetReps: [5, 5] }] }],
      },
      now,
    );
    const slot = program.workouts[0]?.slots[0];
    return { program, slotId: slot?.id ?? '', exerciseId: slot?.exercise.id ?? '' };
  }

  function add(exerciseId: string, body: unknown) {
    return handleAddVariant(
      handlerContext({ db: testDatabase.db, profileId, now, body, params: { id: exerciseId } }),
    );
  }

  describe('adding', () => {
    it('answers the new variant', async () => {
      const { exerciseId } = await squatProgram();

      const response = await add(exerciseId, { name: 'Gym A' });

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toMatchObject({ name: 'Gym A' });
    });

    it('answers 400 invalid-body for a name that is not a string', async () => {
      const { exerciseId } = await squatProgram();

      const response = await add(exerciseId, { name: 3 });

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });

    it('answers 409 name-taken for a name the exercise already has', async () => {
      const { exerciseId } = await squatProgram();
      await add(exerciseId, { name: 'Gym A' });

      const response = await add(exerciseId, { name: 'gym a' });

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'name-taken' });
    });
  });

  describe('removing', () => {
    it('answers how the variant was removed', async () => {
      const { exerciseId } = await squatProgram();
      const variant = expectOk(
        await addVariant(testDatabase.db, profileId, exerciseId, { name: 'Gym A' }, now),
      );

      const response = await handleRemoveVariant(
        handlerContext({
          db: testDatabase.db,
          profileId,
          now,
          params: { id: exerciseId, variantId: variant.id },
        }),
      );

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ removal: 'delete' });
    });
  });

  describe('switching', () => {
    async function openSession() {
      const { program, slotId, exerciseId } = await squatProgram();
      expectOk(await activateProgram(testDatabase.db, profileId, program.id, now));
      const barbell = expectOk(
        await addVariant(testDatabase.db, profileId, exerciseId, { name: 'Barbell' }, now),
      );
      const smith = expectOk(
        await addVariant(
          testDatabase.db,
          profileId,
          exerciseId,
          { name: 'Smith' },
          new Date('2026-10-20T10:01:00Z'),
        ),
      );
      const session = expectOk(
        await startWorkout(testDatabase.db, profileId, program.workouts[0]?.id ?? '', now),
      );
      return { session, slotId, barbell, smith };
    }

    function switchTo(sessionId: string, slotId: string, body: unknown) {
      return handleSwitchVariant(
        handlerContext({
          db: testDatabase.db,
          profileId,
          now,
          body,
          params: { id: sessionId, slotId },
        }),
      );
    }

    it('answers an empty body when the slot has no logged set', async () => {
      const { session, slotId, smith } = await openSession();

      const response = await switchTo(session.id, slotId, { variantId: smith.id });

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({});
    });

    it('answers 409 variant-locked once a set is logged', async () => {
      const { session, slotId, barbell, smith } = await openSession();
      const plannedSetId = session.slots[0]?.plannedSets[0]?.id ?? '';
      expectOk(
        await logSet(testDatabase.db, profileId, session.id, plannedSetId, { reps: 5 }, now),
      );

      const response = await switchTo(session.id, slotId, {
        variantId: session.slots[0]?.variant?.id === smith.id ? barbell.id : smith.id,
      });

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'variant-locked' });
    });

    it('answers 400 invalid-body when variantId is missing', async () => {
      const { session, slotId } = await openSession();

      const response = await switchTo(session.id, slotId, {});

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });
  });
});
