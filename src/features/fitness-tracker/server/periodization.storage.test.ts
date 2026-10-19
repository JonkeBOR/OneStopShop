import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from '../domain/types';
import { activateProgram, skipToBlock } from './activation';
import { ensureProfile } from './profile';
import {
  addTrainingBlock,
  getProgram,
  setSlotPeriodization,
  setUniformPrescription,
} from './programs';
import { plannedSets, plannedSetVariantWeights } from './schema';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import { createProgramFromSpec, expectOk } from './storage-test-support';
import { finishWorkout, logSet, startWorkout } from './training';
import { addVariant } from './variants';

describe('periodization', () => {
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
    clock = Date.parse('2026-10-05T08:00:00Z');
    profileId = (await ensureProfile(testDatabase.db, crypto.randomUUID(), tick())).id;
  });

  function tick(): Date {
    clock += 60_000;
    return new Date(clock);
  }

  async function programWithSlot(blockCount: number, isPeriodized: boolean): Promise<Program> {
    return createProgramFromSpec(
      testDatabase.db,
      profileId,
      {
        blockCount,
        workouts: [
          { name: 'Upper', slots: [{ exercise: 'Curl', targetReps: [12, 12], isPeriodized }] },
        ],
      },
      tick(),
    );
  }

  function slotIdOf(program: Program): string {
    return program.workouts[0]?.slots[0]?.id ?? '';
  }

  async function weightsByBlock(program: Program): Promise<(number | null)[][]> {
    const reloaded = expectOk(await getProgram(testDatabase.db, profileId, program.id));
    return (
      reloaded.workouts[0]?.slots[0]?.prescriptions.map((prescription) =>
        prescription.plannedSets.map((set) => set.lastWeightKg),
      ) ?? []
    );
  }

  async function setWeight(
    program: Program,
    blockIndex: number,
    setNumber: number,
    grams: number | null,
  ): Promise<void> {
    await testDatabase.db
      .update(plannedSets)
      .set({ lastWeightGrams: grams })
      .where(
        and(
          eq(plannedSets.exerciseSlotId, slotIdOf(program)),
          eq(plannedSets.trainingBlockId, program.blocks[blockIndex]?.id ?? ''),
          eq(plannedSets.setNumber, setNumber),
        ),
      );
  }

  async function logWorkout(program: Program, weightsKg: readonly number[]): Promise<void> {
    const { db } = testDatabase;
    const session = expectOk(
      await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
    );
    for (const [index, weightKg] of weightsKg.entries()) {
      expectOk(
        await logSet(
          db,
          profileId,
          session.id,
          session.slots[0]?.plannedSets[index]?.id ?? '',
          { reps: 12, weightKg },
          tick(),
        ),
      );
    }
    expectOk(await finishWorkout(db, profileId, session.id, tick()));
  }

  async function addVariants(exerciseId: string, names: readonly string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      ids.push(
        expectOk(await addVariant(testDatabase.db, profileId, exerciseId, { name }, tick())).id,
      );
    }
    return ids;
  }

  async function park(
    program: Program,
    slotIndex: number,
    blockIndex: number,
    variantId: string,
    gramsBySet: readonly number[],
  ): Promise<void> {
    const slot = program.workouts[0]?.slots[slotIndex];
    const sets = slot?.prescriptions[blockIndex]?.plannedSets ?? [];
    await testDatabase.db.insert(plannedSetVariantWeights).values(
      sets.map((plannedSet, index) => ({
        plannedSetId: plannedSet.id,
        variantId,
        lastWeightGrams: gramsBySet[index] ?? 0,
      })),
    );
  }

  async function variantStateByBlock(program: Program, slotIndex: number) {
    const { db } = testDatabase;
    const slotId = program.workouts[0]?.slots[slotIndex]?.id ?? '';
    const [rows, parked] = await Promise.all([
      db
        .select({
          id: plannedSets.id,
          trainingBlockId: plannedSets.trainingBlockId,
          setNumber: plannedSets.setNumber,
          variantId: plannedSets.variantId,
          lastWeightGrams: plannedSets.lastWeightGrams,
        })
        .from(plannedSets)
        .where(eq(plannedSets.exerciseSlotId, slotId)),
      db
        .select({
          plannedSetId: plannedSetVariantWeights.plannedSetId,
          variantId: plannedSetVariantWeights.variantId,
          lastWeightGrams: plannedSetVariantWeights.lastWeightGrams,
        })
        .from(plannedSetVariantWeights)
        .innerJoin(plannedSets, eq(plannedSets.id, plannedSetVariantWeights.plannedSetId))
        .where(eq(plannedSets.exerciseSlotId, slotId)),
    ]);
    const blockIds = expectOk(await getProgram(db, profileId, program.id)).blocks.map(
      (block) => block.id,
    );
    return blockIds.map((blockId) =>
      rows
        .filter((row) => row.trainingBlockId === blockId)
        .sort((left, right) => left.setNumber - right.setNumber)
        .map((row) => ({
          variantId: row.variantId,
          lastWeightGrams: row.lastWeightGrams,
          parked: parked
            .filter((entry) => entry.plannedSetId === row.id)
            .map(({ variantId, lastWeightGrams }) => ({ variantId, lastWeightGrams })),
        })),
    );
  }

  it('logging a non-periodized set updates that set in every block', async () => {
    const program = await programWithSlot(3, false);
    expectOk(await activateProgram(testDatabase.db, profileId, program.id, tick()));

    await logWorkout(program, [20, 22.5]);

    expect(await weightsByBlock(program)).toEqual([
      [20, 22.5],
      [20, 22.5],
      [20, 22.5],
    ]);
  });

  it('logging a periodized set updates only that block', async () => {
    const program = await programWithSlot(2, true);
    expectOk(await activateProgram(testDatabase.db, profileId, program.id, tick()));

    await logWorkout(program, [20, 22.5]);

    expect(await weightsByBlock(program)).toEqual([
      [20, 22.5],
      [null, null],
    ]);
  });

  it('a non-periodized slot prefills from the last block performed, over a skipped block', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(3, false);
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    await logWorkout(program, [20, 22.5]);
    expectOk(await skipToBlock(db, profileId, { blockId: program.blocks[2]?.id ?? '' }, tick()));

    const session = expectOk(
      await startWorkout(db, profileId, program.workouts[0]?.id ?? '', tick()),
    );

    expect(session.block.number).toBe(3);
    expect(session.slots[0]?.plannedSets.map((set) => set.suggestedWeightKg)).toEqual([20, 22.5]);
  });

  it('turning periodization off carries each set weight from the most recent block that has one', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(3, true);
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    expectOk(await skipToBlock(db, profileId, { blockId: program.blocks[2]?.id ?? '' }, tick()));
    await setWeight(program, 0, 1, 50000);
    await setWeight(program, 0, 2, 45000);
    await setWeight(program, 1, 1, 60000);
    await setWeight(program, 2, 1, 70000);

    const edited = expectOk(
      await setSlotPeriodization(db, profileId, slotIdOf(program), {
        isPeriodized: false,
        targetReps: [10, 10, 10],
      }),
    );

    expect(edited.workouts[0]?.slots[0]?.isPeriodized).toBe(false);
    expect(await weightsByBlock(program)).toEqual([
      [60, 45, null],
      [60, 45, null],
      [60, 45, null],
    ]);
    expect(
      edited.workouts[0]?.slots[0]?.prescriptions.map((prescription) =>
        prescription.plannedSets.map((set) => set.targetReps),
      ),
    ).toEqual([
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ]);
  });

  it('turning periodization on keeps the scheme in every block and clears the weights', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(2, false);
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    await logWorkout(program, [20, 22.5]);

    const edited = expectOk(
      await setSlotPeriodization(db, profileId, slotIdOf(program), { isPeriodized: true }),
    );

    expect(edited.workouts[0]?.slots[0]?.isPeriodized).toBe(true);
    expect(await weightsByBlock(program)).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('turning periodization on for a slot that already is changes nothing', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(2, true);
    await setWeight(program, 0, 1, 50000);

    expectOk(await setSlotPeriodization(db, profileId, slotIdOf(program), { isPeriodized: true }));

    expect(await weightsByBlock(program)).toEqual([
      [50, null],
      [null, null],
    ]);
  });

  it('one scheme for a non-periodized slot keeps the weights of the sets that remain', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(2, false);
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    await logWorkout(program, [20, 22.5]);

    expectOk(await setUniformPrescription(db, profileId, slotIdOf(program), { targetReps: [8] }));

    expect(await weightsByBlock(program)).toEqual([[20], [20]]);
  });

  it('a new block copies the weights of non-periodized slots only', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [
          {
            name: 'Upper',
            slots: [
              { exercise: 'Curl', targetReps: [12], isPeriodized: false },
              { exercise: 'Press', targetReps: [5], isPeriodized: true },
            ],
          },
        ],
      },
      tick(),
    );
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 30000 })
      .where(
        inArray(
          plannedSets.exerciseSlotId,
          program.workouts[0]?.slots.map((slot) => slot.id) ?? [],
        ),
      );

    const edited = expectOk(await addTrainingBlock(db, profileId, program.id, {}));

    expect(
      edited.workouts[0]?.slots.map((slot) =>
        slot.prescriptions[1]?.plannedSets.map((set) => set.lastWeightKg),
      ),
    ).toEqual([[30], [null]]);
  });

  it('a new block copies the slot’s variant, and copies the last block’s parked weights per set for a non-periodized slot', async () => {
    const { db } = testDatabase;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [
          {
            name: 'Upper',
            slots: [
              { exercise: 'Curl', targetReps: [12, 12], isPeriodized: false },
              { exercise: 'Press', targetReps: [5, 5], isPeriodized: true },
            ],
          },
        ],
      },
      tick(),
    );
    const [curlBarbellId, curlCableId] = await addVariants(
      program.workouts[0]?.slots[0]?.exercise.id ?? '',
      ['Barbell', 'Cable'],
    );
    const [pressBarbellId, pressDumbbellId] = await addVariants(
      program.workouts[0]?.slots[1]?.exercise.id ?? '',
      ['Barbell', 'Dumbbell'],
    );
    await db
      .update(plannedSets)
      .set({ lastWeightGrams: 20000 })
      .where(
        inArray(
          plannedSets.exerciseSlotId,
          program.workouts[0]?.slots.map((slot) => slot.id) ?? [],
        ),
      );
    await park(program, 0, 0, curlCableId ?? '', [15000, 17500]);
    await park(program, 1, 0, pressDumbbellId ?? '', [30000, 32500]);

    expectOk(await addTrainingBlock(db, profileId, program.id, {}));

    const curl = await variantStateByBlock(program, 0);
    const press = await variantStateByBlock(program, 1);
    expect(curl[1]).toEqual([
      {
        variantId: curlBarbellId,
        lastWeightGrams: 20000,
        parked: [{ variantId: curlCableId, lastWeightGrams: 15000 }],
      },
      {
        variantId: curlBarbellId,
        lastWeightGrams: 20000,
        parked: [{ variantId: curlCableId, lastWeightGrams: 17500 }],
      },
    ]);
    expect(press[1]).toEqual([
      { variantId: pressBarbellId, lastWeightGrams: null, parked: [] },
      { variantId: pressBarbellId, lastWeightGrams: null, parked: [] },
    ]);
  });

  it('turning periodization on clears parked weights too', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(2, false);
    const [barbellId, cableId] = await addVariants(
      program.workouts[0]?.slots[0]?.exercise.id ?? '',
      ['Barbell', 'Cable'],
    );
    await setWeight(program, 0, 1, 20000);
    await park(program, 0, 0, cableId ?? '', [15000, 15000]);
    await park(program, 0, 1, cableId ?? '', [15000, 15000]);

    expectOk(await setSlotPeriodization(db, profileId, slotIdOf(program), { isPeriodized: true }));

    const cleared = { variantId: barbellId, lastWeightGrams: null, parked: [] };
    expect(await variantStateByBlock(program, 0)).toEqual([
      [cleared, cleared],
      [cleared, cleared],
    ]);
  });

  it('turning periodization off carries each variant’s most recent weight per set into every block', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(3, true);
    const [aId, bId] = await addVariants(program.workouts[0]?.slots[0]?.exercise.id ?? '', [
      'A',
      'B',
    ]);
    expectOk(await activateProgram(db, profileId, program.id, tick()));
    expectOk(await skipToBlock(db, profileId, { blockId: program.blocks[2]?.id ?? '' }, tick()));
    await setWeight(program, 0, 1, 40000);
    await setWeight(program, 0, 2, 40000);
    await park(program, 0, 0, bId ?? '', [30000, 30000]);
    await park(program, 0, 1, bId ?? '', [35000, 35000]);

    expectOk(
      await setSlotPeriodization(db, profileId, slotIdOf(program), {
        isPeriodized: false,
        targetReps: [10, 10, 10],
      }),
    );

    const carried = {
      variantId: aId,
      lastWeightGrams: 40000,
      parked: [{ variantId: bId, lastWeightGrams: 35000 }],
    };
    const added = { variantId: aId, lastWeightGrams: null, parked: [] };
    expect(await variantStateByBlock(program, 0)).toEqual([
      [carried, carried, added],
      [carried, carried, added],
      [carried, carried, added],
    ]);
  });

  it('turning periodization off parks weights only for the sets the new prescription keeps', async () => {
    const { db } = testDatabase;
    const program = await programWithSlot(2, true);
    const [aId, bId] = await addVariants(program.workouts[0]?.slots[0]?.exercise.id ?? '', [
      'A',
      'B',
    ]);
    await park(program, 0, 0, bId ?? '', [30000, 32500]);

    expectOk(
      await setSlotPeriodization(db, profileId, slotIdOf(program), {
        isPeriodized: false,
        targetReps: [10],
      }),
    );

    const kept = {
      variantId: aId,
      lastWeightGrams: null,
      parked: [{ variantId: bId, lastWeightGrams: 30000 }],
    };
    expect(await variantStateByBlock(program, 0)).toEqual([[kept], [kept]]);
  });
});
