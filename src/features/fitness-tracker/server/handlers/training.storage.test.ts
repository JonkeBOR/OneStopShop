import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../../domain/types';
import { activateProgram } from '../activation';
import { ensureProfile } from '../profile';
import { setLogs } from '../schema';
import { openTestDatabase, type TestDatabase } from '../storage-test-database';
import { createProgramFromSpec, expectOk, type ProgramSpec } from '../storage-test-support';
import { getSession, startWorkout } from '../training';
import { handlerContext, jsonOf } from './handler-test-support';
import {
  handleFinishSession,
  handleLogSet,
  handleStartSession,
  handleStartUpcomingSession,
} from './training';

describe('training handlers', () => {
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

  function context(input: { body?: unknown; params?: Record<string, string> }) {
    return handlerContext({ db: testDatabase.db, profileId, now, ...input });
  }

  const twoWorkoutsTwoBlocks: ProgramSpec = {
    blockCount: 2,
    workouts: [
      { name: 'Upper', slots: [{ exercise: 'Press', targetReps: [10, 10] }] },
      { name: 'Lower', slots: [{ exercise: 'Squat', targetReps: [5] }] },
    ],
  };

  async function activeProgram(spec: ProgramSpec = twoWorkoutsTwoBlocks): Promise<Program> {
    const program = await createProgramFromSpec(testDatabase.db, profileId, spec, now);
    expectOk(await activateProgram(testDatabase.db, profileId, program.id, now));
    return program;
  }

  async function start(workoutId: string): Promise<string> {
    const response = await handleStartSession(context({ params: { id: workoutId } }));
    const body = await jsonOf(response);
    return typeof body === 'object' && body !== null && 'sessionId' in body
      ? String(body.sessionId)
      : '';
  }

  describe('starting a workout', () => {
    it('answers the id of the new session', async () => {
      const program = await activeProgram();

      const response = await handleStartSession(
        context({ params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(200);
      const sessionId = (await jsonOf(response)) as { sessionId: string };
      const session = expectOk(await getSession(testDatabase.db, profileId, sessionId.sessionId));
      expect(session).toMatchObject({ status: 'in_progress', workout: { name: 'Upper' } });
    });

    it('edge case: starting a workout that is in progress answers the same session', async () => {
      const program = await activeProgram();
      const workoutId = program.workouts[0]?.id ?? '';

      const first = await start(workoutId);
      const second = await start(workoutId);

      expect(second).toBe(first);
    });

    it('answers 409 workout-already-finished for a finished workout', async () => {
      const program = await activeProgram();
      const workoutId = program.workouts[0]?.id ?? '';
      const sessionId = await start(workoutId);
      await handleFinishSession(context({ params: { id: sessionId } }));

      const response = await handleStartSession(context({ params: { id: workoutId } }));

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'workout-already-finished' });
    });

    it('answers 409 no-active-program when nothing is active', async () => {
      const program = await createProgramFromSpec(
        testDatabase.db,
        profileId,
        twoWorkoutsTwoBlocks,
        now,
      );

      const response = await handleStartSession(
        context({ params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'no-active-program' });
    });

    it('answers 409 workout-not-in-active-program for a workout of another program', async () => {
      await activeProgram();
      const other = await createProgramFromSpec(
        testDatabase.db,
        profileId,
        { ...twoWorkoutsTwoBlocks, name: 'Other' },
        now,
      );

      const response = await handleStartSession(
        context({ params: { id: other.workouts[0]?.id ?? '' } }),
      );

      expect(await jsonOf(response)).toEqual({ error: 'workout-not-in-active-program' });
    });
  });

  describe('opening the upcoming session', () => {
    async function upcoming(): Promise<{ status: number; body: unknown }> {
      const response = await handleStartUpcomingSession(context({}));
      return { status: response.status, body: await jsonOf(response) };
    }

    function sessionIdOf(body: unknown): string {
      return typeof body === 'object' && body !== null && 'sessionId' in body
        ? String(body.sessionId)
        : '';
    }

    it('starts the suggested workout of the current block when none is open', async () => {
      await activeProgram();

      const { status, body } = await upcoming();

      expect(status).toBe(200);
      const session = expectOk(await getSession(testDatabase.db, profileId, sessionIdOf(body)));
      expect(session).toMatchObject({ status: 'in_progress', workout: { name: 'Upper' } });
    });

    it('answers the open session instead of starting another', async () => {
      const program = await activeProgram();
      const open = await start(program.workouts[0]?.id ?? '');

      const { body } = await upcoming();

      expect(sessionIdOf(body)).toBe(open);
    });

    it('moves on to the next workout once the suggested one is finished', async () => {
      const program = await activeProgram();
      const first = await start(program.workouts[0]?.id ?? '');
      await handleFinishSession(context({ params: { id: first } }));

      const { body } = await upcoming();

      const session = expectOk(await getSession(testDatabase.db, profileId, sessionIdOf(body)));
      expect(session.workout.name).toBe('Lower');
    });

    it('answers 409 no-active-program when nothing is active', async () => {
      expect(await upcoming()).toEqual({ status: 409, body: { error: 'no-active-program' } });
    });
  });

  describe('logging a set', () => {
    async function openSession() {
      const program = await activeProgram();
      const sessionId = await start(program.workouts[0]?.id ?? '');
      const session = expectOk(await getSession(testDatabase.db, profileId, sessionId));
      return { sessionId, plannedSets: session.slots[0]?.plannedSets ?? [] };
    }

    function log(sessionId: string, body: unknown) {
      return handleLogSet(context({ body, params: { id: sessionId } }));
    }

    it('US1 scenario 4: records the reps and the changed weight', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 10,
        weightKg: 67.5,
      });

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toMatchObject({ setNumber: 1, reps: 10, weightKg: 67.5 });
    });

    it('records a set with no weight', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 8,
        weightKg: null,
      });

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toMatchObject({ reps: 8, weightKg: null });
    });

    it('R9: refuses to log the same planned set twice and writes no second set log', async () => {
      const { sessionId, plannedSets } = await openSession();
      const body = { plannedSetId: plannedSets[0]?.id, reps: 10, weightKg: 40 };
      await log(sessionId, body);

      const response = await log(sessionId, body);

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'set-already-logged' });
      expect(
        await testDatabase.db.select().from(setLogs).where(eq(setLogs.workoutSessionId, sessionId)),
      ).toHaveLength(1);
    });

    it('lets the other planned set of the same exercise be logged', async () => {
      const { sessionId, plannedSets } = await openSession();
      await log(sessionId, { plannedSetId: plannedSets[0]?.id, reps: 10, weightKg: 40 });

      const response = await log(sessionId, {
        plannedSetId: plannedSets[1]?.id,
        reps: 10,
        weightKg: 40,
      });

      expect(response.status).toBe(200);
    });

    it('answers 400 invalid-reps for zero reps', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 0,
        weightKg: 40,
      });

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-reps' });
    });

    it('answers 400 invalid-weight for a negative weight', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: -2,
      });

      expect(await jsonOf(response)).toEqual({ error: 'invalid-weight' });
    });

    it('answers 409 session-not-in-progress after the workout is finished', async () => {
      const { sessionId, plannedSets } = await openSession();
      await handleFinishSession(context({ params: { id: sessionId } }));

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: 40,
      });

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'session-not-in-progress' });
    });

    it('answers 404 for a session that does not exist', async () => {
      const response = await log(crypto.randomUUID(), {
        plannedSetId: crypto.randomUUID(),
        reps: 5,
        weightKg: 40,
      });

      expect(response.status).toBe(404);
    });

    it('answers 400 invalid-body when the weight is a string', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: '40',
      });

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });

    it('answers 400 invalid-body when the variant is a number', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: 40,
        variantId: 7,
      });

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });

    it('records a set meant for the variant the slot shows', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: 40,
        variantId: null,
      });

      expect(response.status).toBe(200);
    });

    it('answers 409 variant-changed for a set meant for another variant, writing nothing', async () => {
      const { sessionId, plannedSets } = await openSession();

      const response = await log(sessionId, {
        plannedSetId: plannedSets[0]?.id,
        reps: 5,
        weightKg: 40,
        variantId: crypto.randomUUID(),
      });

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'variant-changed' });
      expect(
        await testDatabase.db.select().from(setLogs).where(eq(setLogs.workoutSessionId, sessionId)),
      ).toEqual([]);
    });
  });

  describe('finishing a workout', () => {
    it('US1 scenario 6: answers no progression while the block is incomplete', async () => {
      const program = await activeProgram();
      const sessionId = await start(program.workouts[0]?.id ?? '');

      const response = await handleFinishSession(context({ params: { id: sessionId } }));

      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ progression: 'none', completedBlockNumber: 1 });
    });

    it('US1 scenario 7: answers block-advanced with the number of the completed block', async () => {
      const program = await activeProgram();
      await handleFinishSession(
        context({ params: { id: await start(program.workouts[0]?.id ?? '') } }),
      );

      const response = await handleFinishSession(
        context({ params: { id: await start(program.workouts[1]?.id ?? '') } }),
      );

      expect(await jsonOf(response)).toEqual({
        progression: 'block-advanced',
        completedBlockNumber: 1,
      });
    });

    it('US1 scenario 7: answers new-pass after the last block', async () => {
      const program = await activeProgram({
        blockCount: 1,
        workouts: [{ name: 'Only', slots: [{ exercise: 'Squat', targetReps: [5] }] }],
      });

      const response = await handleFinishSession(
        context({ params: { id: await start(program.workouts[0]?.id ?? '') } }),
      );

      expect(await jsonOf(response)).toEqual({ progression: 'new-pass', completedBlockNumber: 1 });
    });

    it('answers 409 session-not-in-progress the second time', async () => {
      const program = await activeProgram();
      const sessionId = await start(program.workouts[0]?.id ?? '');
      await handleFinishSession(context({ params: { id: sessionId } }));

      const response = await handleFinishSession(context({ params: { id: sessionId } }));

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'session-not-in-progress' });
    });

    it('answers 404 for a session of another profile', async () => {
      const program = await activeProgram();
      const sessionId = await start(program.workouts[0]?.id ?? '');
      const otherProfileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;

      const response = await handleFinishSession(
        handlerContext({
          db: testDatabase.db,
          profileId: otherProfileId,
          now,
          params: { id: sessionId },
        }),
      );

      expect(response.status).toBe(404);
    });
  });

  it('resuming: a started workout keeps its session after the program is read again', async () => {
    const program = await activeProgram();
    const sessionId = await start(program.workouts[0]?.id ?? '');

    const resumed = expectOk(
      await startWorkout(testDatabase.db, profileId, program.workouts[0]?.id ?? '', now),
    );

    expect(resumed.id).toBe(sessionId);
  });
});
