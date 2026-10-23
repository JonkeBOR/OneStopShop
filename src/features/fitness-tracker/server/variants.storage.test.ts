import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fail } from '../domain/result';
import type { Program } from '../domain/types';
import { maxNameLength } from '../domain/values';
import { activateProgram } from './activation';
import { runBatch } from './batch';
import { ensureProfile } from './profile';
import { exerciseVariants, plannedSets, plannedSetVariantWeights, setLogs } from './schema';
import { createProgramFromSpec, defaultVariantOf, expectOk } from './storage-test-support';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import { finishWorkout, getSession, logSet, startWorkout } from './training';
import {
  addVariant,
  listActiveVariants,
  removeVariant,
  renameVariant,
  swapVariantStatements,
  switchSlotVariant,
} from './variants';

describe('exercise variants', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-20T10:00:00Z');
  const later = new Date('2026-10-20T11:00:00Z');
  const latest = new Date('2026-10-20T12:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), now)).id;
  });

  async function squatProgram(owner = profileId): Promise<Program> {
    return createProgramFromSpec(
      testDatabase.db,
      owner,
      {
        blockCount: 2,
        workouts: [
          {
            name: 'Lower A',
            slots: [
              { exercise: 'Squat', targetReps: [5, 5] },
              { exercise: 'Curl', targetReps: [10] },
            ],
          },
          { name: 'Lower B', slots: [{ exercise: 'Squat', targetReps: [8], isPeriodized: false }] },
        ],
      },
      now,
    );
  }

  function slotsOf(program: Program, exerciseName: string) {
    return program.workouts
      .flatMap((workout) => workout.slots)
      .filter((slot) => slot.exercise.name === exerciseName);
  }

  function exerciseIdOf(program: Program, exerciseName: string): string {
    return slotsOf(program, exerciseName)[0]?.exercise.id ?? '';
  }

  function plannedSetIdsOf(program: Program, exerciseName: string): string[] {
    return slotsOf(program, exerciseName).flatMap((slot) =>
      slot.prescriptions.flatMap((prescription) => prescription.plannedSets.map((set) => set.id)),
    );
  }

  async function plannedSetRows(ids: string[]) {
    return testDatabase.db
      .select({
        id: plannedSets.id,
        variantId: plannedSets.variantId,
        lastWeightGrams: plannedSets.lastWeightGrams,
      })
      .from(plannedSets)
      .where(inArray(plannedSets.id, ids))
      .orderBy(asc(plannedSets.id));
  }

  async function parkedRows(ids: string[]) {
    return testDatabase.db
      .select()
      .from(plannedSetVariantWeights)
      .where(inArray(plannedSetVariantWeights.plannedSetId, ids))
      .orderBy(asc(plannedSetVariantWeights.plannedSetId));
  }

  async function setWeights(ids: string[], lastWeightGrams: number | null): Promise<void> {
    await testDatabase.db
      .update(plannedSets)
      .set({ lastWeightGrams })
      .where(inArray(plannedSets.id, ids));
  }

  async function park(ids: string[], variantId: string, lastWeightGrams: number): Promise<void> {
    await testDatabase.db
      .insert(plannedSetVariantWeights)
      .values(ids.map((plannedSetId) => ({ plannedSetId, variantId, lastWeightGrams })));
  }

  async function logSetWith(program: Program, variantId: string): Promise<void> {
    const slot = slotsOf(program, 'Squat')[0];
    await testDatabase.db.insert(setLogs).values({
      id: crypto.randomUUID(),
      profileId,
      exerciseId: slot?.exercise.id ?? '',
      performedAt: now,
      setNumber: 1,
      reps: 5,
      weightGrams: 40000,
      programId: program.id,
      cycleId: program.cycle.id,
      trainingBlockId: program.blocks[0]?.id ?? '',
      workoutId: program.workouts[0]?.id ?? '',
      exerciseSlotId: slot?.id ?? '',
      workoutSessionId: crypto.randomUUID(),
      pass: 1,
      blockNumber: 1,
      variantId,
    });
  }

  async function variantRow(variantId: string) {
    const [row] = await testDatabase.db
      .select()
      .from(exerciseVariants)
      .where(eq(exerciseVariants.id, variantId));
    return row;
  }

  async function renameDefault(exerciseId: string, name: string) {
    const { db } = testDatabase;
    const variant = await defaultVariantOf(db, exerciseId);
    return expectOk(await renameVariant(db, profileId, exerciseId, variant.id, { name }));
  }

  async function activeNames(exerciseId: string): Promise<string[]> {
    const variants = await listActiveVariants(testDatabase.db, [exerciseId]);
    return (variants.get(exerciseId) ?? []).map((variant) => variant.name);
  }

  it('adding a second variant leaves the selection and weights alone', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const squatSets = plannedSetIdsOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    await setWeights(squatSets, 40000);
    const before = await plannedSetRows(squatSets);

    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));

    expect(await plannedSetRows(squatSets)).toEqual(before);
    expect(before.every((row) => row.variantId === barbell.id)).toBe(true);
    expect(await parkedRows(squatSets)).toEqual([]);
    expect((await listActiveVariants(db, [squatId])).get(squatId)).toEqual([barbell, smith]);
  });

  it('refuses a name already used by an active variant of the exercise, ignoring case', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    await renameDefault(squatId, 'Barbell');

    expect(await addVariant(db, profileId, squatId, { name: '  BARBELL ' }, later)).toEqual({
      ok: false,
      error: 'name-taken',
    });
    expect(await addVariant(db, profileId, squatId, { name: '  ' }, later)).toEqual({
      ok: false,
      error: 'name-required',
    });
    expect(await addVariant(db, profileId, squatId, { name: 'a'.repeat(101) }, later)).toEqual({
      ok: false,
      error: 'name-too-long',
    });
    expect(await activeNames(squatId)).toEqual(['Barbell']);
    expectOk(
      await addVariant(db, profileId, exerciseIdOf(program, 'Curl'), { name: 'Barbell' }, later),
    );
  });

  it('a removed variant’s name can be used again', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    await logSetWith(program, barbell.id);
    expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    expectOk(await removeVariant(db, profileId, squatId, barbell.id, later));

    const again = expectOk(await addVariant(db, profileId, squatId, { name: 'barbell' }, latest));

    expect(again.id).not.toBe(barbell.id);
    expect(await activeNames(squatId)).toEqual(['Smith', 'barbell']);
  });

  it('removing a variant with logged sets retires it and hides it from listActiveVariants', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const squatSets = plannedSetIdsOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    await setWeights(squatSets, 40000);
    await park(squatSets, smith.id, 30000);
    await logSetWith(program, smith.id);

    expect(await removeVariant(db, profileId, squatId, smith.id, latest)).toEqual({
      ok: true,
      value: { removal: 'retire' },
    });

    expect((await variantRow(smith.id))?.removedAt).toEqual(latest);
    expect(await activeNames(squatId)).toEqual(['Barbell']);
    expect(await parkedRows(squatSets)).toEqual([]);
    const rows = await plannedSetRows(squatSets);
    expect(rows.every((row) => row.variantId === barbell.id && row.lastWeightGrams === 40000)).toBe(
      true,
    );
  });

  it('removing a variant without logged sets deletes it', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));

    expect(await removeVariant(db, profileId, squatId, smith.id, latest)).toEqual({
      ok: true,
      value: { removal: 'delete' },
    });

    expect(await variantRow(smith.id)).toBeUndefined();
    expect(await activeNames(squatId)).toEqual(['Barbell']);
  });

  it('removing the selected variant falls back to the oldest remaining variant and its parked weights', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const squatSets = plannedSetIdsOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    const goblet = expectOk(await addVariant(db, profileId, squatId, { name: 'Goblet' }, latest));
    await setWeights(squatSets, 40000);
    await park(squatSets, smith.id, 30000);
    await park(squatSets, goblet.id, 20000);
    await logSetWith(program, barbell.id);

    expectOk(await removeVariant(db, profileId, squatId, barbell.id, latest));

    const rows = await plannedSetRows(squatSets);
    expect(rows.every((row) => row.variantId === smith.id && row.lastWeightGrams === 30000)).toBe(
      true,
    );
    const parked = await parkedRows(squatSets);
    expect(
      parked.every((row) => row.variantId === goblet.id && row.lastWeightGrams === 20000),
    ).toBe(true);
    expect(parked).toHaveLength(squatSets.length);
  });

  it('refuses to remove the only active variant, even beside a retired one, and changes nothing', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const squatSets = plannedSetIdsOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    await logSetWith(program, barbell.id);
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    expectOk(await removeVariant(db, profileId, squatId, barbell.id, later));

    expect(await removeVariant(db, profileId, squatId, smith.id, latest)).toEqual(
      fail('last-variant'),
    );

    expect(await activeNames(squatId)).toEqual(['Smith']);
    expect((await plannedSetRows(squatSets)).every((row) => row.variantId === smith.id)).toBe(true);
  });

  it('renames a variant and refuses a name another active variant has, ignoring case', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    await renameDefault(squatId, 'Gym A');
    const gymB = expectOk(await addVariant(db, profileId, squatId, { name: 'Gym B' }, later));

    const renamed = expectOk(
      await renameVariant(db, profileId, squatId, gymB.id, { name: ' Gym C ' }),
    );

    expect(renamed).toEqual({ id: gymB.id, name: 'Gym C' });
    expect(await activeNames(squatId)).toEqual(['Gym A', 'Gym C']);
    expect(await renameVariant(db, profileId, squatId, gymB.id, { name: 'gym a' })).toEqual(
      fail('name-taken'),
    );
    expect(await activeNames(squatId)).toEqual(['Gym A', 'Gym C']);
  });

  it('renaming allows a change of case and a retired variant’s name', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const gymA = await renameDefault(squatId, 'Gym A');
    const old = expectOk(await addVariant(db, profileId, squatId, { name: 'Old' }, later));
    await logSetWith(program, old.id);
    expectOk(await removeVariant(db, profileId, squatId, old.id, later));

    expectOk(await renameVariant(db, profileId, squatId, gymA.id, { name: 'GYM A' }));
    expect(await activeNames(squatId)).toEqual(['GYM A']);
    expectOk(await renameVariant(db, profileId, squatId, gymA.id, { name: 'Old' }));
    expect(await activeNames(squatId)).toEqual(['Old']);
  });

  it('renaming refuses empty, too long, a retired variant and another profile’s variant', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const gymA = await renameDefault(squatId, 'Gym A');
    const old = expectOk(await addVariant(db, profileId, squatId, { name: 'Old' }, later));
    await logSetWith(program, old.id);
    expectOk(await removeVariant(db, profileId, squatId, old.id, later));
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    expect(await renameVariant(db, profileId, squatId, gymA.id, { name: '' })).toEqual(
      fail('name-required'),
    );
    expect(
      await renameVariant(db, profileId, squatId, gymA.id, {
        name: 'x'.repeat(maxNameLength + 1),
      }),
    ).toEqual(fail('name-too-long'));
    expect(await renameVariant(db, profileId, squatId, old.id, { name: 'New' })).toEqual(
      fail('not-found'),
    );
    expect(await renameVariant(db, otherProfileId, squatId, gymA.id, { name: 'New' })).toEqual(
      fail('not-found'),
    );
    expect(await activeNames(squatId)).toEqual(['Gym A']);
  });

  it('another profile’s exercise or variant is not-found and nothing changes', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const curlId = exerciseIdOf(program, 'Curl');
    const squatSets = plannedSetIdsOf(program, 'Squat');
    const barbell = await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    await logSetWith(program, smith.id);
    expectOk(await removeVariant(db, profileId, squatId, smith.id, later));
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const before = await plannedSetRows(squatSets);

    expect(await addVariant(db, otherProfileId, squatId, { name: 'Goblet' }, latest)).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(
      await addVariant(db, profileId, crypto.randomUUID(), { name: 'Goblet' }, latest),
    ).toEqual({ ok: false, error: 'not-found' });
    expect(await removeVariant(db, otherProfileId, squatId, barbell.id, latest)).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await removeVariant(db, profileId, curlId, barbell.id, latest)).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await removeVariant(db, profileId, squatId, smith.id, latest)).toEqual({
      ok: false,
      error: 'not-found',
    });

    expect(await activeNames(squatId)).toEqual(['Barbell']);
    expect((await variantRow(barbell.id))?.removedAt).toBeNull();
    expect((await variantRow(smith.id))?.removedAt).toEqual(later);
    expect(await plannedSetRows(squatSets)).toEqual(before);
  });

  it('switching with parkCurrent parks the current weights and restores the target’s', async () => {
    const { db } = testDatabase;
    const program = await squatProgram();
    const squatId = exerciseIdOf(program, 'Squat');
    const slot = slotsOf(program, 'Squat')[0];
    const slotSets = (slot?.prescriptions ?? []).flatMap((prescription) =>
      prescription.plannedSets.map((set) => set.id),
    );
    const otherSets = plannedSetIdsOf(program, 'Squat').filter((id) => !slotSets.includes(id));
    const barbell = await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    await setWeights(slotSets.slice(0, 2), 40000);
    await setWeights(slotSets.slice(2), null);
    await park(slotSets.slice(1, 2), smith.id, 30000);
    const scope = eq(plannedSets.exerciseSlotId, slot?.id ?? '');

    await runBatch(db, swapVariantStatements(db, scope, smith.id, { parkCurrent: true }));

    const rows = await plannedSetRows(slotSets);
    expect(rows.every((row) => row.variantId === smith.id)).toBe(true);
    expect(Object.fromEntries(rows.map((row) => [row.id, row.lastWeightGrams]))).toEqual(
      Object.fromEntries(slotSets.map((id, index) => [id, index === 1 ? 30000 : null])),
    );
    const parked = await parkedRows(slotSets);
    expect(parked.map((row) => [row.plannedSetId, row.variantId, row.lastWeightGrams])).toEqual(
      [...slotSets.slice(0, 2)].sort().map((id) => [id, barbell.id, 40000]),
    );
    expect((await plannedSetRows(otherSets)).every((row) => row.variantId === barbell.id)).toBe(
      true,
    );

    await runBatch(db, swapVariantStatements(db, scope, barbell.id, { parkCurrent: true }));

    const restored = await plannedSetRows(slotSets);
    expect(
      Object.fromEntries(restored.map((row) => [row.id, [row.variantId, row.lastWeightGrams]])),
    ).toEqual(
      Object.fromEntries(slotSets.map((id, index) => [id, [barbell.id, index < 2 ? 40000 : null]])),
    );
    const reparked = await db
      .select()
      .from(plannedSetVariantWeights)
      .where(
        and(
          inArray(plannedSetVariantWeights.plannedSetId, slotSets),
          eq(plannedSetVariantWeights.variantId, smith.id),
        ),
      );
    expect(reparked.map((row) => [row.plannedSetId, row.lastWeightGrams])).toEqual([
      [slotSets[1], 30000],
    ]);
    expect(await parkedRows(slotSets)).toHaveLength(1);
  });

  async function switchingSetup() {
    const { db } = testDatabase;
    const program = await squatProgram();
    expectOk(await activateProgram(db, profileId, program.id, now));
    const squatId = exerciseIdOf(program, 'Squat');
    const slotId = slotsOf(program, 'Squat')[0]?.id ?? '';
    const barbell = await renameDefault(squatId, 'Barbell');
    const smith = expectOk(await addVariant(db, profileId, squatId, { name: 'Smith' }, later));
    const session = expectOk(await startWorkout(db, profileId, program.workouts[0]?.id ?? '', now));
    return { program, slotId, barbell, smith, session };
  }

  async function slotSetRows(slotId: string) {
    return testDatabase.db
      .select({
        id: plannedSets.id,
        blockId: plannedSets.trainingBlockId,
        setNumber: plannedSets.setNumber,
        variantId: plannedSets.variantId,
        lastWeightGrams: plannedSets.lastWeightGrams,
      })
      .from(plannedSets)
      .where(eq(plannedSets.exerciseSlotId, slotId))
      .orderBy(asc(plannedSets.trainingBlockId), asc(plannedSets.setNumber));
  }

  it('switching loads the target’s weights into every block of the slot and parks the current ones', async () => {
    const { db } = testDatabase;
    const { slotId, barbell, smith, session } = await switchingSetup();
    const before = await slotSetRows(slotId);
    expect(before).toHaveLength(4);
    const blockIds = [...new Set(before.map((row) => row.blockId))];
    const weightFor = (row: { blockId: string; setNumber: number }, base: number) =>
      base + blockIds.indexOf(row.blockId) * 5000 + row.setNumber * 1000;
    for (const row of before) {
      await setWeights([row.id], weightFor(row, 40000));
      await park([row.id], smith.id, weightFor(row, 20000));
    }

    expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));

    const rows = await slotSetRows(slotId);
    expect(rows.every((row) => row.variantId === smith.id)).toBe(true);
    expect(rows.map((row) => row.lastWeightGrams)).toEqual(
      before.map((row) => weightFor(row, 20000)),
    );
    const parked = await parkedRows(rows.map((row) => row.id));
    expect(parked.every((row) => row.variantId === barbell.id)).toBe(true);
    expect(
      Object.fromEntries(parked.map((row) => [row.plannedSetId, row.lastWeightGrams])),
    ).toEqual(Object.fromEntries(before.map((row) => [row.id, weightFor(row, 40000)])));
    expect(parked).toHaveLength(4);
  });

  it('switching A → B → A restores A’s weights exactly and never parks a null', async () => {
    const { db } = testDatabase;
    const { slotId, barbell, smith, session } = await switchingSetup();
    const before = await slotSetRows(slotId);
    await setWeights(
      before.filter((row) => row.setNumber === 1).map((row) => row.id),
      40000,
    );

    expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));
    expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: barbell.id }));

    const rows = await slotSetRows(slotId);
    expect(rows.every((row) => row.variantId === barbell.id)).toBe(true);
    expect(rows.map((row) => [row.setNumber, row.lastWeightGrams])).toEqual([
      [1, 40000],
      [2, null],
      [1, 40000],
      [2, null],
    ]);
    expect(await parkedRows(rows.map((row) => row.id))).toEqual([]);
  });

  it('refuses to switch once a set of the slot is logged in this session, and another slot does not lock it', async () => {
    const { db } = testDatabase;
    const { slotId, barbell, smith, session } = await switchingSetup();
    const slotOf = async (predicate: (id: string) => boolean) =>
      expectOk(await getSession(db, profileId, session.id)).slots.find((entry) =>
        predicate(entry.id),
      );
    const curl = await slotOf((id) => id !== slotId);
    expectOk(
      await logSet(db, profileId, session.id, curl?.plannedSets[0]?.id ?? '', { reps: 10 }, now),
    );

    expectOk(await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }));

    const squat = await slotOf((id) => id === slotId);
    expectOk(
      await logSet(
        db,
        profileId,
        session.id,
        squat?.plannedSets[0]?.id ?? '',
        { reps: 5, weightKg: 30 },
        later,
      ),
    );
    const before = await slotSetRows(slotId);
    const parkedBefore = await parkedRows(before.map((row) => row.id));

    expect(
      await switchSlotVariant(db, profileId, session.id, slotId, { variantId: barbell.id }),
    ).toEqual({ ok: false, error: 'variant-locked' });

    expect(await slotSetRows(slotId)).toEqual(before);
    expect(await parkedRows(before.map((row) => row.id))).toEqual(parkedBefore);
  });

  it('switching to the selected variant succeeds without writing', async () => {
    const { db } = testDatabase;
    const { slotId, barbell, session } = await switchingSetup();
    await setWeights(
      (await slotSetRows(slotId)).map((row) => row.id),
      40000,
    );
    const before = await slotSetRows(slotId);

    expect(
      await switchSlotVariant(db, profileId, session.id, slotId, { variantId: barbell.id }),
    ).toEqual({ ok: true, value: undefined });

    expect(await slotSetRows(slotId)).toEqual(before);
    expect(await parkedRows(before.map((row) => row.id))).toEqual([]);
  });

  it('refuses another profile’s session, a slot outside the session’s workout and a variant of another exercise as not-found, and a finished session as not in progress', async () => {
    const { db } = testDatabase;
    const { program, slotId, smith, session } = await switchingSetup();
    const curlVariant = expectOk(
      await addVariant(db, profileId, exerciseIdOf(program, 'Curl'), { name: 'Cable' }, now),
    );
    const otherWorkoutSlotId = program.workouts[1]?.slots[0]?.id ?? '';
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const before = await slotSetRows(slotId);
    const otherWorkoutBefore = await slotSetRows(otherWorkoutSlotId);
    const refused = { ok: false, error: 'not-found' };

    expect(
      await switchSlotVariant(db, otherProfileId, session.id, slotId, { variantId: smith.id }),
    ).toEqual(refused);
    expect(
      await switchSlotVariant(db, profileId, session.id, otherWorkoutSlotId, {
        variantId: smith.id,
      }),
    ).toEqual(refused);
    expect(
      await switchSlotVariant(db, profileId, session.id, crypto.randomUUID(), {
        variantId: smith.id,
      }),
    ).toEqual(refused);
    expect(
      await switchSlotVariant(db, profileId, crypto.randomUUID(), slotId, { variantId: smith.id }),
    ).toEqual(refused);
    expect(
      await switchSlotVariant(db, profileId, session.id, slotId, { variantId: curlVariant.id }),
    ).toEqual(refused);
    expect(await slotSetRows(slotId)).toEqual(before);
    expect(await slotSetRows(otherWorkoutSlotId)).toEqual(otherWorkoutBefore);

    expectOk(await finishWorkout(db, profileId, session.id, later));

    expect(
      await switchSlotVariant(db, profileId, session.id, slotId, { variantId: smith.id }),
    ).toEqual({ ok: false, error: 'session-not-in-progress' });
    expect(await slotSetRows(slotId)).toEqual(before);
  });
});
