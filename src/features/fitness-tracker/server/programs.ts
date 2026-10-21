import 'server-only';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Database } from '@/lib/server/database';
import { canUseInSlot } from '../domain/exercise';
import {
  carriedWeightsBySet,
  draftsForNewBlock,
  draftsForNewSlot,
  type PlannedSetDraft,
  planPrescriptionChange,
  reorder,
  validateBlockCount,
} from '../domain/program';
import { reevaluateAfterEdit } from '../domain/progression';
import { fail, type Result, succeed } from '../domain/result';
import type { Program, ProgramSummary } from '../domain/types';
import { isNameTaken, parseName } from '../domain/values';
import type { ParkedWeight } from '../domain/variant';
import { chunkIds, chunkRows, runBatch, type Statement } from './batch';
import { insertCycleStatement, startPassStatements } from './cycle-statements';
import { type ProgramRows, toProgram } from './mapping';
import {
  cycles,
  exerciseSlots,
  exercises,
  plannedSets,
  plannedSetVariantWeights,
  profiles,
  programs,
  trainingBlocks,
  workoutSessions,
  workouts,
} from './schema';
import { listActiveVariants } from './variants';

type NameError = 'name-required' | 'name-too-long' | 'name-taken';
type MoveError = 'not-found' | 'invalid-position';
type TargetsError = 'prescription-needs-a-set' | 'invalid-target';
type ExistingPlannedSet = {
  id: string;
  trainingBlockId: string;
  setNumber: number;
  lastWeightGrams: number | null;
};

const plannedSetColumns = 7;
const parkedWeightColumns = 3;
const trainingBlockColumns = 4;

export async function loadProgramRows(
  db: Database,
  profileId: string,
  programId: string,
): Promise<ProgramRows | null> {
  const found = await db.query.programs.findFirst({
    where: and(
      eq(programs.id, programId),
      eq(programs.profileId, profileId),
      isNull(programs.deletedAt),
    ),
    with: {
      blocks: true,
      workouts: { with: { slots: { with: { exercise: true, plannedSets: true } } } },
      cycles: true,
    },
  });
  if (!found) {
    return null;
  }
  const [profile] = await db
    .select({ activeProgramId: profiles.activeProgramId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  const { blocks, workouts: workoutRows, cycles: cycleRows, ...program } = found;
  return {
    program,
    isActive: profile?.activeProgramId === programId,
    blocks,
    workouts: workoutRows,
    cycles: cycleRows,
  };
}

export async function getProgram(
  db: Database,
  profileId: string,
  programId: string,
): Promise<Result<Program, 'not-found'>> {
  const rows = await loadProgramRows(db, profileId, programId);
  return rows ? succeed(toProgram(rows)) : fail('not-found');
}

async function programIdOfBlock(
  db: Database,
  profileId: string,
  blockId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ programId: trainingBlocks.programId })
    .from(trainingBlocks)
    .innerJoin(programs, eq(programs.id, trainingBlocks.programId))
    .where(and(eq(trainingBlocks.id, blockId), eq(programs.profileId, profileId)))
    .limit(1);
  return row?.programId ?? null;
}

async function otherProgramNames(
  db: Database,
  profileId: string,
  exceptProgramId: string | null,
): Promise<string[]> {
  const scope =
    exceptProgramId === null
      ? and(eq(programs.profileId, profileId), isNull(programs.deletedAt))
      : and(
          eq(programs.profileId, profileId),
          isNull(programs.deletedAt),
          ne(programs.id, exceptProgramId),
        );
  const rows = await db.select({ name: programs.name }).from(programs).where(scope);
  return rows.map((row) => row.name);
}

async function otherWorkoutNames(
  db: Database,
  programId: string,
  exceptWorkoutId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: workouts.name })
    .from(workouts)
    .where(and(eq(workouts.programId, programId), ne(workouts.id, exceptWorkoutId)));
  return rows.map((row) => row.name);
}

async function programIdOfWorkout(
  db: Database,
  profileId: string,
  workoutId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ programId: workouts.programId })
    .from(workouts)
    .innerJoin(programs, eq(programs.id, workouts.programId))
    .where(and(eq(workouts.id, workoutId), eq(programs.profileId, profileId)))
    .limit(1);
  return row?.programId ?? null;
}

async function programIdOfSlot(
  db: Database,
  profileId: string,
  slotId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ programId: workouts.programId })
    .from(exerciseSlots)
    .innerJoin(workouts, eq(workouts.id, exerciseSlots.workoutId))
    .innerJoin(programs, eq(programs.id, workouts.programId))
    .where(and(eq(exerciseSlots.id, slotId), eq(programs.profileId, profileId)))
    .limit(1);
  return row?.programId ?? null;
}

function insertPlannedSets(db: Database, drafts: readonly PlannedSetDraft[]): Statement[] {
  const rows = drafts.map((draft) => ({
    id: crypto.randomUUID(),
    exerciseSlotId: draft.exerciseSlotId,
    trainingBlockId: draft.trainingBlockId,
    setNumber: draft.setNumber,
    targetReps: draft.targetReps,
    lastWeightGrams: draft.lastWeightGrams ?? null,
    variantId: draft.variantId ?? null,
  }));
  const parkedRows = rows.flatMap((row, index) =>
    (drafts[index]?.parkedWeights ?? []).map((parked) => ({
      plannedSetId: row.id,
      variantId: parked.variantId,
      lastWeightGrams: parked.lastWeightGrams,
    })),
  );
  return [
    ...chunkRows(rows, plannedSetColumns).map((part) => db.insert(plannedSets).values(part)),
    ...chunkRows(parkedRows, parkedWeightColumns).map((part) =>
      db.insert(plannedSetVariantWeights).values(part),
    ),
  ];
}

function deleteParkedWeightsOfSlot(db: Database, slotId: string): Statement {
  return db
    .delete(plannedSetVariantWeights)
    .where(
      inArray(
        plannedSetVariantWeights.plannedSetId,
        db
          .select({ id: plannedSets.id })
          .from(plannedSets)
          .where(eq(plannedSets.exerciseSlotId, slotId)),
      ),
    );
}

async function slotVariantId(db: Database, slotId: string): Promise<string | null> {
  const [row] = await db
    .select({ variantId: plannedSets.variantId })
    .from(plannedSets)
    .where(eq(plannedSets.exerciseSlotId, slotId))
    .limit(1);
  return row?.variantId ?? null;
}

async function oldestActiveVariantId(db: Database, exerciseId: string): Promise<string | null> {
  const variants = await listActiveVariants(db, [exerciseId]);
  return variants.get(exerciseId)?.[0]?.id ?? null;
}

function reorderBlocks(
  db: Database,
  programId: string,
  orderedIds: readonly string[],
): Statement[] {
  return [
    db
      .update(trainingBlocks)
      .set({ position: sql`-${trainingBlocks.position}` })
      .where(eq(trainingBlocks.programId, programId)),
    ...orderedIds.map((id, index) =>
      db
        .update(trainingBlocks)
        .set({ position: index + 1 })
        .where(eq(trainingBlocks.id, id)),
    ),
  ];
}

function reorderWorkouts(
  db: Database,
  programId: string,
  orderedIds: readonly string[],
): Statement[] {
  return [
    db
      .update(workouts)
      .set({ position: sql`-${workouts.position}` })
      .where(eq(workouts.programId, programId)),
    ...orderedIds.map((id, index) =>
      db
        .update(workouts)
        .set({ position: index + 1 })
        .where(eq(workouts.id, id)),
    ),
  ];
}

function reorderSlots(db: Database, workoutId: string, orderedIds: readonly string[]): Statement[] {
  return [
    db
      .update(exerciseSlots)
      .set({ position: sql`-${exerciseSlots.position}` })
      .where(eq(exerciseSlots.workoutId, workoutId)),
    ...orderedIds.map((id, index) =>
      db
        .update(exerciseSlots)
        .set({ position: index + 1 })
        .where(eq(exerciseSlots.id, id)),
    ),
  ];
}

export async function listPrograms(db: Database, profileId: string): Promise<ProgramSummary[]> {
  const [rows, blockCounts, workoutCounts, [profile]] = await Promise.all([
    db
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(and(eq(programs.profileId, profileId), isNull(programs.deletedAt)))
      .orderBy(asc(programs.createdAt), asc(programs.id)),
    db
      .select({ programId: trainingBlocks.programId, total: count() })
      .from(trainingBlocks)
      .innerJoin(programs, eq(programs.id, trainingBlocks.programId))
      .where(eq(programs.profileId, profileId))
      .groupBy(trainingBlocks.programId),
    db
      .select({ programId: workouts.programId, total: count() })
      .from(workouts)
      .innerJoin(programs, eq(programs.id, workouts.programId))
      .where(eq(programs.profileId, profileId))
      .groupBy(workouts.programId),
    db
      .select({ activeProgramId: profiles.activeProgramId })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1),
  ]);
  const totalOf = (counts: { programId: string; total: number }[], programId: string): number =>
    counts.find((entry) => entry.programId === programId)?.total ?? 0;
  return rows.map((row) => ({
    ...row,
    isActive: profile?.activeProgramId === row.id,
    blockCount: totalOf(blockCounts, row.id),
    workoutCount: totalOf(workoutCounts, row.id),
  }));
}

export async function createProgram(
  db: Database,
  profileId: string,
  input: { name: string; blockCount: number },
  now: Date,
): Promise<Result<Program, NameError | 'invalid-block-count'>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  const blockCount = validateBlockCount(input.blockCount);
  if (!blockCount.ok) {
    return fail(blockCount.error);
  }
  if (isNameTaken(name.value, await otherProgramNames(db, profileId, null))) {
    return fail('name-taken');
  }
  const programId = crypto.randomUUID();
  const blockRows = Array.from({ length: blockCount.value }, (_, index) => ({
    id: crypto.randomUUID(),
    programId,
    position: index + 1,
    label: null,
  }));
  const firstBlockId = blockRows[0]?.id;
  if (firstBlockId === undefined) {
    throw new Error('A program needs at least one block');
  }
  await runBatch(db, [
    db.insert(programs).values({ id: programId, profileId, name: name.value, createdAt: now }),
    ...chunkRows(blockRows, trainingBlockColumns).map((part) =>
      db.insert(trainingBlocks).values(part),
    ),
    insertCycleStatement(db, programId, firstBlockId),
  ]);
  return getProgram(db, profileId, programId).then((found) => {
    if (!found.ok) {
      throw new Error('The program was not found after it was created');
    }
    return succeed(found.value);
  });
}

export async function renameProgram(
  db: Database,
  profileId: string,
  programId: string,
  input: { name: string },
): Promise<Result<Program, NameError | 'not-found'>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  if (isNameTaken(name.value, await otherProgramNames(db, profileId, programId))) {
    return fail('name-taken');
  }
  const [row] = await db
    .update(programs)
    .set({ name: name.value })
    .where(
      and(
        eq(programs.id, programId),
        eq(programs.profileId, profileId),
        isNull(programs.deletedAt),
      ),
    )
    .returning({ id: programs.id });
  return row ? getProgram(db, profileId, programId) : fail('not-found');
}

export async function addTrainingBlock(
  db: Database,
  profileId: string,
  programId: string,
  input: { label?: string | null },
): Promise<Result<Program, 'not-found'>> {
  const rows = await loadProgramRows(db, profileId, programId);
  if (!rows) {
    return fail('not-found');
  }
  const lastBlock = [...rows.blocks].sort((left, right) => right.position - left.position)[0];
  if (!lastBlock) {
    return fail('not-found');
  }
  const newBlockId = crypto.randomUUID();
  const parkedBySet = await parkedWeightsOfBlock(db, lastBlock.id);
  const slotTargets = rows.workouts.flatMap((workout) =>
    workout.slots.map((slot) => {
      const lastBlockSets = slot.plannedSets
        .filter((plannedSet) => plannedSet.trainingBlockId === lastBlock.id)
        .sort((left, right) => left.setNumber - right.setNumber);
      return {
        slotId: slot.id,
        targetReps: lastBlockSets.map((plannedSet) => plannedSet.targetReps),
        lastWeightsGrams: slot.isPeriodized
          ? []
          : lastBlockSets.map((plannedSet) => plannedSet.lastWeightGrams),
        variantId: slot.plannedSets[0]?.variantId ?? null,
        parkedWeightsBySet: slot.isPeriodized
          ? []
          : lastBlockSets.map((plannedSet) => parkedBySet.get(plannedSet.id) ?? []),
      };
    }),
  );
  await runBatch(db, [
    db.insert(trainingBlocks).values({
      id: newBlockId,
      programId,
      position: lastBlock.position + 1,
      label: normalizeLabel(input.label),
    }),
    ...insertPlannedSets(db, draftsForNewBlock(slotTargets, newBlockId)),
  ]);
  return getProgram(db, profileId, programId);
}

async function parkedWeightsOfBlock(
  db: Database,
  blockId: string,
): Promise<Map<string, ParkedWeight[]>> {
  const rows = await db
    .select({
      plannedSetId: plannedSetVariantWeights.plannedSetId,
      variantId: plannedSetVariantWeights.variantId,
      lastWeightGrams: plannedSetVariantWeights.lastWeightGrams,
    })
    .from(plannedSetVariantWeights)
    .innerJoin(plannedSets, eq(plannedSets.id, plannedSetVariantWeights.plannedSetId))
    .where(eq(plannedSets.trainingBlockId, blockId));
  const bySet = new Map<string, ParkedWeight[]>();
  for (const { plannedSetId, ...parked } of rows) {
    bySet.set(plannedSetId, [...(bySet.get(plannedSetId) ?? []), parked]);
  }
  return bySet;
}

function normalizeLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function labelTrainingBlock(
  db: Database,
  profileId: string,
  blockId: string,
  input: { label: string | null },
): Promise<Result<Program, 'not-found'>> {
  const programId = await programIdOfBlock(db, profileId, blockId);
  if (programId === null) {
    return fail('not-found');
  }
  await db
    .update(trainingBlocks)
    .set({ label: normalizeLabel(input.label) })
    .where(eq(trainingBlocks.id, blockId));
  return getProgram(db, profileId, programId);
}

export async function moveTrainingBlock(
  db: Database,
  profileId: string,
  blockId: string,
  input: { toPosition: number },
): Promise<Result<Program, MoveError>> {
  const programId = await programIdOfBlock(db, profileId, blockId);
  if (programId === null) {
    return fail('not-found');
  }
  const siblings = await db
    .select({ id: trainingBlocks.id })
    .from(trainingBlocks)
    .where(eq(trainingBlocks.programId, programId))
    .orderBy(asc(trainingBlocks.position));
  const order = reorder(
    siblings.map((sibling) => sibling.id),
    blockId,
    input.toPosition,
  );
  if (!order.ok) {
    return fail(order.error);
  }
  await runBatch(db, reorderBlocks(db, programId, order.value));
  return getProgram(db, profileId, programId);
}

export async function addWorkout(
  db: Database,
  profileId: string,
  programId: string,
  input: { name: string },
): Promise<Result<Program, NameError | 'not-found'>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  const rows = await loadProgramRows(db, profileId, programId);
  if (!rows) {
    return fail('not-found');
  }
  const workoutNames = rows.workouts.map((workout) => workout.name);
  if (isNameTaken(name.value, workoutNames)) {
    return fail('name-taken');
  }
  await db.insert(workouts).values({
    id: crypto.randomUUID(),
    programId,
    position: rows.workouts.length + 1,
    name: name.value,
  });
  return getProgram(db, profileId, programId);
}

export async function renameWorkout(
  db: Database,
  profileId: string,
  workoutId: string,
  input: { name: string },
): Promise<Result<Program, NameError | 'not-found'>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  const programId = await programIdOfWorkout(db, profileId, workoutId);
  if (programId === null) {
    return fail('not-found');
  }
  if (isNameTaken(name.value, await otherWorkoutNames(db, programId, workoutId))) {
    return fail('name-taken');
  }
  await db.update(workouts).set({ name: name.value }).where(eq(workouts.id, workoutId));
  return getProgram(db, profileId, programId);
}

export async function moveWorkout(
  db: Database,
  profileId: string,
  workoutId: string,
  input: { toPosition: number },
): Promise<Result<Program, MoveError>> {
  const programId = await programIdOfWorkout(db, profileId, workoutId);
  if (programId === null) {
    return fail('not-found');
  }
  const siblings = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.programId, programId))
    .orderBy(asc(workouts.position));
  const order = reorder(
    siblings.map((sibling) => sibling.id),
    workoutId,
    input.toPosition,
  );
  if (!order.ok) {
    return fail(order.error);
  }
  await runBatch(db, reorderWorkouts(db, programId, order.value));
  return getProgram(db, profileId, programId);
}

export async function addExerciseSlot(
  db: Database,
  profileId: string,
  workoutId: string,
  input: { exerciseId: string; targetReps: number[]; isPeriodized?: boolean },
): Promise<
  Result<Program, 'not-found' | 'exercise-archived' | 'exercise-already-in-workout' | TargetsError>
> {
  const programId = await programIdOfWorkout(db, profileId, workoutId);
  if (programId === null) {
    return fail('not-found');
  }
  const [exercise] = await db
    .select({ archivedAt: exercises.archivedAt })
    .from(exercises)
    .where(and(eq(exercises.id, input.exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  if (!exercise) {
    return fail('not-found');
  }
  const [blocks, existingSlots] = await Promise.all([
    db
      .select({ id: trainingBlocks.id })
      .from(trainingBlocks)
      .where(eq(trainingBlocks.programId, programId))
      .orderBy(asc(trainingBlocks.position)),
    db
      .select({ id: exerciseSlots.id, exerciseId: exerciseSlots.exerciseId })
      .from(exerciseSlots)
      .where(eq(exerciseSlots.workoutId, workoutId)),
  ]);
  const usable = canUseInSlot({
    isArchived: exercise.archivedAt !== null,
    isInWorkout: existingSlots.some((slot) => slot.exerciseId === input.exerciseId),
  });
  if (!usable.ok) {
    return fail(usable.error);
  }
  const slotId = crypto.randomUUID();
  const drafts = draftsForNewSlot(
    slotId,
    input.targetReps,
    blocks.map((block) => block.id),
  );
  if (!drafts.ok) {
    return fail(drafts.error);
  }
  const variantId = await oldestActiveVariantId(db, input.exerciseId);
  await runBatch(db, [
    db.insert(exerciseSlots).values({
      id: slotId,
      workoutId,
      position: existingSlots.length + 1,
      exerciseId: input.exerciseId,
      isOptional: false,
      isPeriodized: input.isPeriodized ?? true,
    }),
    ...insertPlannedSets(
      db,
      drafts.value.map((draft) => ({ ...draft, variantId })),
    ),
  ]);
  return getProgram(db, profileId, programId);
}

export async function setSlotOptional(
  db: Database,
  profileId: string,
  slotId: string,
  input: { isOptional: boolean },
): Promise<Result<Program, 'not-found'>> {
  const programId = await programIdOfSlot(db, profileId, slotId);
  if (programId === null) {
    return fail('not-found');
  }
  await db
    .update(exerciseSlots)
    .set({ isOptional: input.isOptional })
    .where(eq(exerciseSlots.id, slotId));
  return getProgram(db, profileId, programId);
}

async function workoutIdOfSlot(db: Database, slotId: string): Promise<string | null> {
  const [row] = await db
    .select({ workoutId: exerciseSlots.workoutId })
    .from(exerciseSlots)
    .where(eq(exerciseSlots.id, slotId))
    .limit(1);
  return row?.workoutId ?? null;
}

async function orderedSlotIds(db: Database, workoutId: string): Promise<string[]> {
  const rows = await db
    .select({ id: exerciseSlots.id })
    .from(exerciseSlots)
    .where(eq(exerciseSlots.workoutId, workoutId))
    .orderBy(asc(exerciseSlots.position));
  return rows.map((row) => row.id);
}

export async function moveExerciseSlot(
  db: Database,
  profileId: string,
  slotId: string,
  input: { toPosition: number },
): Promise<Result<Program, MoveError>> {
  const programId = await programIdOfSlot(db, profileId, slotId);
  const workoutId = programId === null ? null : await workoutIdOfSlot(db, slotId);
  if (programId === null || workoutId === null) {
    return fail('not-found');
  }
  const order = reorder(await orderedSlotIds(db, workoutId), slotId, input.toPosition);
  if (!order.ok) {
    return fail(order.error);
  }
  await runBatch(db, reorderSlots(db, workoutId, order.value));
  return getProgram(db, profileId, programId);
}

export async function removeExerciseSlot(
  db: Database,
  profileId: string,
  slotId: string,
): Promise<Result<Program, 'not-found'>> {
  const programId = await programIdOfSlot(db, profileId, slotId);
  const workoutId = programId === null ? null : await workoutIdOfSlot(db, slotId);
  if (programId === null || workoutId === null) {
    return fail('not-found');
  }
  const remaining = (await orderedSlotIds(db, workoutId)).filter((id) => id !== slotId);
  await runBatch(db, [
    db.delete(exerciseSlots).where(eq(exerciseSlots.id, slotId)),
    ...reorderSlots(db, workoutId, remaining),
  ]);
  return getProgram(db, profileId, programId);
}

async function slotSettings(
  db: Database,
  profileId: string,
  slotId: string,
): Promise<{ programId: string; isPeriodized: boolean } | null> {
  const [row] = await db
    .select({ programId: workouts.programId, isPeriodized: exerciseSlots.isPeriodized })
    .from(exerciseSlots)
    .innerJoin(workouts, eq(workouts.id, exerciseSlots.workoutId))
    .innerJoin(programs, eq(programs.id, workouts.programId))
    .where(and(eq(exerciseSlots.id, slotId), eq(programs.profileId, profileId)))
    .limit(1);
  return row ?? null;
}

async function existingPlannedSets(db: Database, slotId: string): Promise<ExistingPlannedSet[]> {
  return db
    .select({
      id: plannedSets.id,
      trainingBlockId: plannedSets.trainingBlockId,
      setNumber: plannedSets.setNumber,
      lastWeightGrams: plannedSets.lastWeightGrams,
    })
    .from(plannedSets)
    .where(eq(plannedSets.exerciseSlotId, slotId));
}

async function orderedBlockIds(db: Database, programId: string): Promise<string[]> {
  const rows = await db
    .select({ id: trainingBlocks.id })
    .from(trainingBlocks)
    .where(eq(trainingBlocks.programId, programId))
    .orderBy(asc(trainingBlocks.position));
  return rows.map((row) => row.id);
}

function prescriptionStatements(
  db: Database,
  slotId: string,
  blockId: string,
  variantId: string | null,
  existing: readonly { id: string; setNumber: number }[],
  targetReps: readonly number[],
): Result<Statement[], TargetsError> {
  const change = planPrescriptionChange(existing, targetReps);
  if (!change.ok) {
    return fail(change.error);
  }
  return succeed([
    ...change.value.update.map((item) =>
      db
        .update(plannedSets)
        .set({ targetReps: item.targetReps })
        .where(eq(plannedSets.id, item.id)),
    ),
    ...insertPlannedSets(
      db,
      change.value.insert.map((item) => ({
        exerciseSlotId: slotId,
        trainingBlockId: blockId,
        setNumber: item.setNumber,
        targetReps: item.targetReps,
        variantId,
      })),
    ),
    ...chunkIds(change.value.deleteIds).map((ids) =>
      db.delete(plannedSets).where(inArray(plannedSets.id, ids)),
    ),
  ]);
}

function uniformPrescriptionStatements(
  db: Database,
  slotId: string,
  variantId: string | null,
  blockIds: readonly string[],
  existing: readonly ExistingPlannedSet[],
  targetReps: readonly number[],
): Result<Statement[], TargetsError> {
  const statements: Statement[] = [];
  for (const blockId of blockIds) {
    const blockStatements = prescriptionStatements(
      db,
      slotId,
      blockId,
      variantId,
      existing.filter((plannedSet) => plannedSet.trainingBlockId === blockId),
      targetReps,
    );
    if (!blockStatements.ok) {
      return fail(blockStatements.error);
    }
    statements.push(...blockStatements.value);
  }
  return succeed(statements);
}

export async function setPrescription(
  db: Database,
  profileId: string,
  slotId: string,
  blockId: string,
  input: { targetReps: number[] },
): Promise<Result<Program, 'not-found' | 'slot-not-periodized' | TargetsError>> {
  const [slot, blockProgramId] = await Promise.all([
    slotSettings(db, profileId, slotId),
    programIdOfBlock(db, profileId, blockId),
  ]);
  if (slot === null || slot.programId !== blockProgramId) {
    return fail('not-found');
  }
  if (!slot.isPeriodized) {
    return fail('slot-not-periodized');
  }
  const [existing, variantId] = await Promise.all([
    db
      .select({ id: plannedSets.id, setNumber: plannedSets.setNumber })
      .from(plannedSets)
      .where(and(eq(plannedSets.exerciseSlotId, slotId), eq(plannedSets.trainingBlockId, blockId))),
    slotVariantId(db, slotId),
  ]);
  const statements = prescriptionStatements(
    db,
    slotId,
    blockId,
    variantId,
    existing,
    input.targetReps,
  );
  if (!statements.ok) {
    return fail(statements.error);
  }
  await runBatch(db, statements.value);
  return getProgram(db, profileId, slot.programId);
}

export async function setUniformPrescription(
  db: Database,
  profileId: string,
  slotId: string,
  input: { targetReps: number[] },
): Promise<Result<Program, 'not-found' | 'slot-periodized' | TargetsError>> {
  const slot = await slotSettings(db, profileId, slotId);
  if (slot === null) {
    return fail('not-found');
  }
  if (slot.isPeriodized) {
    return fail('slot-periodized');
  }
  const [blockIds, existing, variantId] = await Promise.all([
    orderedBlockIds(db, slot.programId),
    existingPlannedSets(db, slotId),
    slotVariantId(db, slotId),
  ]);
  const statements = uniformPrescriptionStatements(
    db,
    slotId,
    variantId,
    blockIds,
    existing,
    input.targetReps,
  );
  if (!statements.ok) {
    return fail(statements.error);
  }
  await runBatch(db, statements.value);
  return getProgram(db, profileId, slot.programId);
}

export async function setSlotPeriodization(
  db: Database,
  profileId: string,
  slotId: string,
  input: { isPeriodized: true } | { isPeriodized: false; targetReps: number[] },
): Promise<Result<Program, 'not-found' | TargetsError>> {
  const slot = await slotSettings(db, profileId, slotId);
  if (slot === null) {
    return fail('not-found');
  }
  if (input.isPeriodized) {
    if (!slot.isPeriodized) {
      await runBatch(db, [
        db.update(exerciseSlots).set({ isPeriodized: true }).where(eq(exerciseSlots.id, slotId)),
        db
          .update(plannedSets)
          .set({ lastWeightGrams: null })
          .where(eq(plannedSets.exerciseSlotId, slotId)),
        deleteParkedWeightsOfSlot(db, slotId),
      ]);
    }
    return getProgram(db, profileId, slot.programId);
  }
  const [blockIds, existing, [cycle], variantId, parked] = await Promise.all([
    orderedBlockIds(db, slot.programId),
    existingPlannedSets(db, slotId),
    db
      .select({ currentBlockId: cycles.currentBlockId })
      .from(cycles)
      .where(eq(cycles.programId, slot.programId))
      .limit(1),
    slotVariantId(db, slotId),
    parkedWeightsOfSlot(db, slotId),
  ]);
  const statements = uniformPrescriptionStatements(
    db,
    slotId,
    variantId,
    blockIds,
    existing,
    input.targetReps,
  );
  if (!statements.ok) {
    return fail(statements.error);
  }
  const currentBlockId = cycle?.currentBlockId ?? '';
  const carried = carriedWeightsBySet(blockIds, currentBlockId, existing);
  const carriedParked = [...groupByVariant(parked)].flatMap(([parkedVariantId, rows]) =>
    [...carriedWeightsBySet(blockIds, currentBlockId, rows)]
      .filter(([setNumber]) => setNumber <= input.targetReps.length)
      .map(([setNumber, lastWeightGrams]) =>
        parkWeightOnSetNumber(db, slotId, setNumber, {
          variantId: parkedVariantId,
          lastWeightGrams,
        }),
      ),
  );
  await runBatch(db, [
    db.update(exerciseSlots).set({ isPeriodized: false }).where(eq(exerciseSlots.id, slotId)),
    ...statements.value,
    ...input.targetReps.map((_, index) =>
      db
        .update(plannedSets)
        .set({ lastWeightGrams: carried.get(index + 1) ?? null })
        .where(and(eq(plannedSets.exerciseSlotId, slotId), eq(plannedSets.setNumber, index + 1))),
    ),
    deleteParkedWeightsOfSlot(db, slotId),
    ...carriedParked,
  ]);
  return getProgram(db, profileId, slot.programId);
}

type SlotParkedWeight = ParkedWeight & { trainingBlockId: string; setNumber: number };

async function parkedWeightsOfSlot(db: Database, slotId: string): Promise<SlotParkedWeight[]> {
  return db
    .select({
      variantId: plannedSetVariantWeights.variantId,
      lastWeightGrams: plannedSetVariantWeights.lastWeightGrams,
      trainingBlockId: plannedSets.trainingBlockId,
      setNumber: plannedSets.setNumber,
    })
    .from(plannedSetVariantWeights)
    .innerJoin(plannedSets, eq(plannedSets.id, plannedSetVariantWeights.plannedSetId))
    .where(eq(plannedSets.exerciseSlotId, slotId));
}

function groupByVariant(parked: readonly SlotParkedWeight[]): Map<string, SlotParkedWeight[]> {
  const byVariant = new Map<string, SlotParkedWeight[]>();
  for (const row of parked) {
    byVariant.set(row.variantId, [...(byVariant.get(row.variantId) ?? []), row]);
  }
  return byVariant;
}

function parkWeightOnSetNumber(
  db: Database,
  slotId: string,
  setNumber: number,
  parked: ParkedWeight,
): Statement {
  return db.insert(plannedSetVariantWeights).select(
    db
      .select({
        plannedSetId: plannedSets.id,
        variantId: sql<string>`${parked.variantId}`.as('variant_id'),
        lastWeightGrams: sql<number>`${parked.lastWeightGrams}`.as('last_weight_grams'),
      })
      .from(plannedSets)
      .where(and(eq(plannedSets.exerciseSlotId, slotId), eq(plannedSets.setNumber, setNumber))),
  );
}

export async function replaceSlotExercise(
  db: Database,
  profileId: string,
  slotId: string,
  input: { exerciseId: string },
): Promise<Result<Program, 'not-found' | 'exercise-archived' | 'exercise-already-in-workout'>> {
  const programId = await programIdOfSlot(db, profileId, slotId);
  if (programId === null) {
    return fail('not-found');
  }
  const [exercise] = await db
    .select({ archivedAt: exercises.archivedAt })
    .from(exercises)
    .where(and(eq(exercises.id, input.exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  if (!exercise) {
    return fail('not-found');
  }
  const siblings = alias(exerciseSlots, 'sibling_slots');
  const sameExerciseElsewhere = await db
    .select({ id: siblings.id })
    .from(exerciseSlots)
    .innerJoin(siblings, eq(siblings.workoutId, exerciseSlots.workoutId))
    .where(
      and(
        eq(exerciseSlots.id, slotId),
        ne(siblings.id, slotId),
        eq(siblings.exerciseId, input.exerciseId),
      ),
    )
    .limit(1);
  const usable = canUseInSlot({
    isArchived: exercise.archivedAt !== null,
    isInWorkout: sameExerciseElsewhere.length > 0,
  });
  if (!usable.ok) {
    return fail(usable.error);
  }
  const variantId = await oldestActiveVariantId(db, input.exerciseId);
  await runBatch(db, [
    db
      .update(exerciseSlots)
      .set({ exerciseId: input.exerciseId })
      .where(eq(exerciseSlots.id, slotId)),
    deleteParkedWeightsOfSlot(db, slotId),
    db
      .update(plannedSets)
      .set({ lastWeightGrams: null, variantId })
      .where(eq(plannedSets.exerciseSlotId, slotId)),
  ]);
  return getProgram(db, profileId, programId);
}

async function reevaluateProgramCycle(
  db: Database,
  programId: string,
  change: {
    blockIdsBefore: readonly string[];
    blockIdsAfter: readonly string[];
    removedBlockId: string | null;
    workoutIds: readonly string[];
  },
  now: Date,
): Promise<Statement[]> {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.programId, programId)).limit(1);
  const firstBlockId = change.blockIdsAfter[0];
  if (!cycle || firstBlockId === undefined) {
    return [];
  }
  const finished = await db
    .select({ workoutId: workoutSessions.workoutId })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.cycleId, cycle.id),
        eq(workoutSessions.pass, cycle.pass),
        eq(workoutSessions.trainingBlockId, cycle.currentBlockId),
        eq(workoutSessions.status, 'finished'),
      ),
    );
  const decision = reevaluateAfterEdit({
    ...change,
    currentBlockId: cycle.currentBlockId,
    finishedWorkoutIdsInCurrentBlock: finished.map((row) => row.workoutId),
  });
  if (decision.kind === 'move') {
    return [
      db.update(cycles).set({ currentBlockId: decision.toBlockId }).where(eq(cycles.id, cycle.id)),
    ];
  }
  if (decision.kind === 'new-pass') {
    return startPassStatements(db, { id: cycle.id, programId }, firstBlockId, now);
  }
  return [];
}

export async function removeTrainingBlock(
  db: Database,
  profileId: string,
  blockId: string,
  now: Date,
): Promise<Result<Program, 'not-found' | 'program-needs-a-block'>> {
  const programId = await programIdOfBlock(db, profileId, blockId);
  if (programId === null) {
    return fail('not-found');
  }
  const [siblings, workoutRows] = await Promise.all([
    db
      .select({ id: trainingBlocks.id })
      .from(trainingBlocks)
      .where(eq(trainingBlocks.programId, programId))
      .orderBy(asc(trainingBlocks.position)),
    db.select({ id: workouts.id }).from(workouts).where(eq(workouts.programId, programId)),
  ]);
  if (siblings.length <= 1) {
    return fail('program-needs-a-block');
  }
  const remaining = siblings.map((sibling) => sibling.id).filter((id) => id !== blockId);
  await runBatch(db, [
    db.delete(trainingBlocks).where(eq(trainingBlocks.id, blockId)),
    ...reorderBlocks(db, programId, remaining),
    ...(await reevaluateProgramCycle(
      db,
      programId,
      {
        blockIdsBefore: siblings.map((sibling) => sibling.id),
        blockIdsAfter: remaining,
        removedBlockId: blockId,
        workoutIds: workoutRows.map((row) => row.id),
      },
      now,
    )),
  ]);
  return getProgram(db, profileId, programId);
}

export async function removeWorkout(
  db: Database,
  profileId: string,
  workoutId: string,
  now: Date,
): Promise<Result<Program, 'not-found'>> {
  const programId = await programIdOfWorkout(db, profileId, workoutId);
  if (programId === null) {
    return fail('not-found');
  }
  const [siblings, blockRows] = await Promise.all([
    db
      .select({ id: workouts.id })
      .from(workouts)
      .where(eq(workouts.programId, programId))
      .orderBy(asc(workouts.position)),
    db
      .select({ id: trainingBlocks.id })
      .from(trainingBlocks)
      .where(eq(trainingBlocks.programId, programId))
      .orderBy(asc(trainingBlocks.position)),
  ]);
  const blockIds = blockRows.map((row) => row.id);
  const remaining = siblings.map((sibling) => sibling.id).filter((id) => id !== workoutId);
  await runBatch(db, [
    db
      .update(workoutSessions)
      .set({ status: 'finished', finishedAt: now })
      .where(
        and(eq(workoutSessions.workoutId, workoutId), eq(workoutSessions.status, 'in_progress')),
      ),
    db.delete(workouts).where(eq(workouts.id, workoutId)),
    ...reorderWorkouts(db, programId, remaining),
    ...(await reevaluateProgramCycle(
      db,
      programId,
      {
        blockIdsBefore: blockIds,
        blockIdsAfter: blockIds,
        removedBlockId: null,
        workoutIds: remaining,
      },
      now,
    )),
  ]);
  return getProgram(db, profileId, programId);
}

export async function deleteProgram(
  db: Database,
  profileId: string,
  programId: string,
  now: Date,
): Promise<Result<void, 'not-found'>> {
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(
      and(
        eq(programs.id, programId),
        eq(programs.profileId, profileId),
        isNull(programs.deletedAt),
      ),
    )
    .limit(1);
  if (!program) {
    return fail('not-found');
  }
  await runBatch(db, [
    db
      .update(profiles)
      .set({ activeProgramId: null })
      .where(and(eq(profiles.id, profileId), eq(profiles.activeProgramId, programId))),
    db
      .update(workoutSessions)
      .set({ status: 'finished', finishedAt: now })
      .where(
        and(eq(workoutSessions.programId, programId), eq(workoutSessions.status, 'in_progress')),
      ),
    db.delete(workouts).where(eq(workouts.programId, programId)),
    db.delete(trainingBlocks).where(eq(trainingBlocks.programId, programId)),
    db.delete(cycles).where(eq(cycles.programId, programId)),
    db.update(programs).set({ deletedAt: now }).where(eq(programs.id, programId)),
  ]);
  return succeed(undefined);
}
