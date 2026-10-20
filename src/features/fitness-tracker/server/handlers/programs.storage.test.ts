import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../../domain/types';
import { activateProgram, pauseActiveProgram } from '../activation';
import { ensureProfile } from '../profile';
import { getProgram } from '../programs';
import { setLogs } from '../schema';
import { openTestDatabase, type TestDatabase } from '../storage-test-database';
import { createProgramFromSpec, expectOk, type ProgramSpec } from '../storage-test-support';
import { logSet, startWorkout } from '../training';
import { handlerContext, jsonOf } from './handler-test-support';
import {
  handleAddBlock,
  handleAddWorkout,
  handleCreateProgram,
  handleDeleteProgram,
  handleLabelBlock,
  handleRemoveBlock,
  handleRemoveWorkout,
  handleRenameProgram,
  handleUpdateWorkout,
} from './programs';

describe('program handlers', () => {
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

  const twoWorkouts: ProgramSpec = {
    blockCount: 2,
    workouts: [
      { name: 'Upper', slots: [{ exercise: 'Press', targetReps: [5] }] },
      { name: 'Lower', slots: [{ exercise: 'Squat', targetReps: [5] }] },
    ],
  };

  async function build(spec: ProgramSpec = twoWorkouts): Promise<Program> {
    return createProgramFromSpec(testDatabase.db, profileId, spec, now);
  }

  async function reload(program: Program): Promise<Program> {
    return expectOk(await getProgram(testDatabase.db, profileId, program.id));
  }

  describe('create and rename', () => {
    it('US3 scenario 1: creates a program with its blocks and answers its id', async () => {
      const response = await handleCreateProgram(
        context({ body: { name: 'Strength', blockCount: 4 } }),
      );

      expect(response.status).toBe(200);
      const body = await jsonOf(response);
      const id = typeof body === 'object' && body !== null && 'id' in body ? String(body.id) : '';
      const program = expectOk(await getProgram(testDatabase.db, profileId, id));
      expect(program).toMatchObject({ name: 'Strength' });
      expect(program.blocks).toHaveLength(4);
    });

    it('creates a program with one block when no block count is given', async () => {
      const response = await handleCreateProgram(context({ body: { name: 'Strength' } }));

      expect(response.status).toBe(200);
      const body = await jsonOf(response);
      const id = typeof body === 'object' && body !== null && 'id' in body ? String(body.id) : '';
      expect(expectOk(await getProgram(testDatabase.db, profileId, id)).blocks).toHaveLength(1);
    });

    it('answers 409 name-taken for a name the profile already uses', async () => {
      await build({ name: 'Strength', blockCount: 1, workouts: [] });

      const response = await handleCreateProgram(context({ body: { name: 'strength' } }));

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'name-taken' });
    });

    it('answers 400 invalid-block-count for no blocks', async () => {
      const response = await handleCreateProgram(
        context({ body: { name: 'Strength', blockCount: 0 } }),
      );

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-block-count' });
    });

    it('answers 400 name-required for a blank name', async () => {
      const response = await handleCreateProgram(context({ body: { name: ' ', blockCount: 4 } }));

      expect(await jsonOf(response)).toEqual({ error: 'name-required' });
    });

    it('renames a program', async () => {
      const program = await build();

      const response = await handleRenameProgram(
        context({ body: { name: 'Renamed' }, params: { id: program.id } }),
      );

      expect(response.status).toBe(200);
      expect((await reload(program)).name).toBe('Renamed');
    });

    it('answers 404 for a program that does not exist', async () => {
      const response = await handleRenameProgram(
        context({ body: { name: 'X' }, params: { id: crypto.randomUUID() } }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('delete', () => {
    it('FR-033: refuses to delete the active program', async () => {
      const program = await build();
      expectOk(await activateProgram(testDatabase.db, profileId, program.id, now));

      const response = await handleDeleteProgram(context({ params: { id: program.id } }));

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'program-active' });
      expect((await reload(program)).id).toBe(program.id);
    });

    it('FR-033: deletes an inactive program and keeps its logged sets', async () => {
      const { db } = testDatabase;
      const program = await build();
      expectOk(await activateProgram(db, profileId, program.id, now));
      const session = expectOk(
        await startWorkout(db, profileId, program.workouts[0]?.id ?? '', now),
      );
      expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[0]?.id ?? '',
          { reps: 5, weightKg: 60 },
          now,
        ),
      );
      expectOk(await pauseActiveProgram(db, profileId, now));

      const response = await handleDeleteProgram(context({ params: { id: program.id } }));

      expect(response.status).toBe(200);
      expect(await getProgram(db, profileId, program.id)).toEqual({
        ok: false,
        error: 'not-found',
      });
      expect(await db.select().from(setLogs).where(eq(setLogs.profileId, profileId))).toHaveLength(
        1,
      );
    });

    it('answers 404 for a program of another profile', async () => {
      const program = await build();
      const otherProfileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;

      const response = await handleDeleteProgram(
        handlerContext({
          db: testDatabase.db,
          profileId: otherProfileId,
          now,
          params: { id: program.id },
        }),
      );

      expect(response.status).toBe(404);
      expect((await reload(program)).id).toBe(program.id);
    });
  });

  describe('blocks', () => {
    it('US3 scenario 7: adds a block at the end that copies the previous block', async () => {
      const program = await build();

      const response = await handleAddBlock(context({ body: {}, params: { id: program.id } }));

      expect(response.status).toBe(200);
      const edited = await reload(program);
      expect(edited.blocks).toHaveLength(3);
      expect(
        edited.workouts[0]?.slots[0]?.prescriptions.map((prescription) =>
          prescription.plannedSets.map((set) => set.targetReps),
        ),
      ).toEqual([[5], [5], [5]]);
    });

    it('labels a block, and an empty label clears it', async () => {
      const program = await build();
      const blockId = program.blocks[0]?.id ?? '';

      await handleLabelBlock(context({ body: { label: 'Deload' }, params: { id: blockId } }));
      expect((await reload(program)).blocks[0]?.label).toBe('Deload');

      await handleLabelBlock(context({ body: { label: '' }, params: { id: blockId } }));
      expect((await reload(program)).blocks[0]?.label).toBeNull();

      await handleLabelBlock(context({ body: { label: 'Again' }, params: { id: blockId } }));
      await handleLabelBlock(context({ body: { label: null }, params: { id: blockId } }));
      expect((await reload(program)).blocks[0]?.label).toBeNull();
    });

    it('removes a block', async () => {
      const program = await build();

      const response = await handleRemoveBlock(
        context({ params: { id: program.blocks[1]?.id ?? '' } }),
      );

      expect(response.status).toBe(200);
      expect((await reload(program)).blocks).toHaveLength(1);
    });

    it('answers 409 program-needs-a-block for the last remaining block', async () => {
      const program = await build({ blockCount: 1, workouts: [] });

      const response = await handleRemoveBlock(
        context({ params: { id: program.blocks[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(409);
      expect(await jsonOf(response)).toEqual({ error: 'program-needs-a-block' });
    });

    it('answers 400 invalid-body when the label is a number', async () => {
      const program = await build();

      const response = await handleLabelBlock(
        context({ body: { label: 3 }, params: { id: program.blocks[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('workouts', () => {
    it('US3 scenario 2: adds a workout and answers its id', async () => {
      const program = await build({ blockCount: 2, workouts: [] });

      const response = await handleAddWorkout(
        context({ body: { name: 'Day 1' }, params: { id: program.id } }),
      );

      expect(response.status).toBe(200);
      const edited = await reload(program);
      expect(edited.workouts.map((workout) => workout.name)).toEqual(['Day 1']);
      expect(await jsonOf(response)).toEqual({ id: edited.workouts[0]?.id });
    });

    it('renames a workout', async () => {
      const program = await build();

      await handleUpdateWorkout(
        context({ body: { name: 'Push' }, params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect((await reload(program)).workouts[0]?.name).toBe('Push');
    });

    it('moves a workout to a position', async () => {
      const program = await build();

      const response = await handleUpdateWorkout(
        context({ body: { toPosition: 2 }, params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(200);
      expect((await reload(program)).workouts.map((workout) => workout.name)).toEqual([
        'Lower',
        'Upper',
      ]);
    });

    it('answers 400 invalid-position for a position that does not exist', async () => {
      const program = await build();

      const response = await handleUpdateWorkout(
        context({ body: { toPosition: 9 }, params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-position' });
    });

    it('answers 400 invalid-body when it is given neither a name nor a position', async () => {
      const program = await build();

      const response = await handleUpdateWorkout(
        context({ body: {}, params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(400);
      expect(await jsonOf(response)).toEqual({ error: 'invalid-body' });
    });

    it('removes a workout', async () => {
      const program = await build();

      const response = await handleRemoveWorkout(
        context({ params: { id: program.workouts[0]?.id ?? '' } }),
      );

      expect(response.status).toBe(200);
      expect((await reload(program)).workouts.map((workout) => workout.name)).toEqual(['Lower']);
    });
  });
});
