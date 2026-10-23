import 'server-only';
import { and, asc, count, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { fail, type Result, succeed } from '../domain/result';
import type { ExerciseVariant } from '../domain/types';
import { nameKey, parseName } from '../domain/values';
import { decideVariantRemoval, decideVariantSwitch, fallbackVariantId } from '../domain/variant';
import { chunkIds, runBatch, type Statement } from './batch';
import { toExerciseVariant } from './mapping';
import {
  exerciseSlots,
  exerciseVariants,
  exercises,
  plannedSets,
  plannedSetVariantWeights,
  setLogs,
  workoutSessions,
} from './schema';

export async function listActiveVariants(
  db: Database,
  exerciseIds: readonly string[],
): Promise<Map<string, ExerciseVariant[]>> {
  const variants = new Map<string, ExerciseVariant[]>(exerciseIds.map((id) => [id, []]));
  for (const chunk of chunkIds(exerciseIds)) {
    const rows = await db
      .select()
      .from(exerciseVariants)
      .where(and(inArray(exerciseVariants.exerciseId, chunk), isNull(exerciseVariants.removedAt)))
      .orderBy(asc(exerciseVariants.createdAt), asc(exerciseVariants.id));
    for (const row of rows) {
      variants.get(row.exerciseId)?.push(toExerciseVariant(row));
    }
  }
  return variants;
}

async function ownsExercise(db: Database, profileId: string, exerciseId: string): Promise<boolean> {
  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  return exercise !== undefined;
}

export async function addVariant(
  db: Database,
  profileId: string,
  exerciseId: string,
  input: { name: string },
  now: Date,
): Promise<
  Result<ExerciseVariant, 'name-required' | 'name-too-long' | 'name-taken' | 'not-found'>
> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  if (!(await ownsExercise(db, profileId, exerciseId))) {
    return fail('not-found');
  }
  const key = nameKey(name.value);
  const active = await db
    .select({ nameKey: exerciseVariants.nameKey })
    .from(exerciseVariants)
    .where(and(eq(exerciseVariants.exerciseId, exerciseId), isNull(exerciseVariants.removedAt)));
  if (active.some((variant) => variant.nameKey === key)) {
    return fail('name-taken');
  }
  const row = {
    id: crypto.randomUUID(),
    exerciseId,
    name: name.value,
    nameKey: key,
    createdAt: now,
    removedAt: null,
  };
  const statements: Statement[] = [db.insert(exerciseVariants).values(row)];
  if (active.length === 0) {
    statements.push(
      db
        .update(plannedSets)
        .set({ variantId: row.id })
        .where(
          inArray(
            plannedSets.exerciseSlotId,
            db
              .select({ id: exerciseSlots.id })
              .from(exerciseSlots)
              .where(eq(exerciseSlots.exerciseId, exerciseId)),
          ),
        ),
    );
  }
  await runBatch(db, statements);
  return succeed(toExerciseVariant(row));
}

export async function renameVariant(
  db: Database,
  profileId: string,
  exerciseId: string,
  variantId: string,
  input: { name: string },
): Promise<
  Result<ExerciseVariant, 'name-required' | 'name-too-long' | 'name-taken' | 'not-found'>
> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  if (!(await ownsExercise(db, profileId, exerciseId))) {
    return fail('not-found');
  }
  const active = await db
    .select()
    .from(exerciseVariants)
    .where(and(eq(exerciseVariants.exerciseId, exerciseId), isNull(exerciseVariants.removedAt)));
  const variant = active.find((entry) => entry.id === variantId);
  if (!variant) {
    return fail('not-found');
  }
  const key = nameKey(name.value);
  if (active.some((entry) => entry.id !== variantId && entry.nameKey === key)) {
    return fail('name-taken');
  }
  await db
    .update(exerciseVariants)
    .set({ name: name.value, nameKey: key })
    .where(eq(exerciseVariants.id, variantId));
  return succeed(toExerciseVariant({ ...variant, name: name.value, nameKey: key }));
}

export async function removeVariant(
  db: Database,
  profileId: string,
  exerciseId: string,
  variantId: string,
  now: Date,
): Promise<Result<{ removal: 'retire' | 'delete' }, 'not-found' | 'last-variant'>> {
  const [variant] = await db
    .select({ id: exerciseVariants.id })
    .from(exerciseVariants)
    .innerJoin(exercises, eq(exercises.id, exerciseVariants.exerciseId))
    .where(
      and(
        eq(exerciseVariants.id, variantId),
        eq(exerciseVariants.exerciseId, exerciseId),
        eq(exercises.profileId, profileId),
        isNull(exerciseVariants.removedAt),
      ),
    )
    .limit(1);
  if (!variant) {
    return fail('not-found');
  }
  const [active, [log]] = await Promise.all([
    listActiveVariants(db, [exerciseId]),
    db
      .select({ id: setLogs.id })
      .from(setLogs)
      .where(and(eq(setLogs.profileId, profileId), eq(setLogs.variantId, variantId)))
      .limit(1),
  ]);
  const activeIds = (active.get(exerciseId) ?? []).map((entry) => entry.id);
  const decision = decideVariantRemoval({
    activeVariantIds: activeIds,
    variantId,
    hasSetLogs: log !== undefined,
  });
  if (!decision.ok) {
    return fail(decision.error);
  }
  const removal = decision.value;
  await runBatch(db, [
    db.delete(plannedSetVariantWeights).where(eq(plannedSetVariantWeights.variantId, variantId)),
    ...swapVariantStatements(
      db,
      eq(plannedSets.variantId, variantId),
      fallbackVariantId(activeIds, variantId),
      { parkCurrent: false },
    ),
    removal === 'retire'
      ? db
          .update(exerciseVariants)
          .set({ removedAt: now })
          .where(eq(exerciseVariants.id, variantId))
      : db.delete(exerciseVariants).where(eq(exerciseVariants.id, variantId)),
  ]);
  return succeed({ removal });
}

export async function switchSlotVariant(
  db: Database,
  profileId: string,
  sessionId: string,
  slotId: string,
  input: { variantId: string },
): Promise<Result<void, 'not-found' | 'session-not-in-progress' | 'variant-locked'>> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)))
    .limit(1);
  if (!session) {
    return fail('not-found');
  }
  const [slot] = await db
    .select({ exerciseId: exerciseSlots.exerciseId })
    .from(exerciseSlots)
    .where(and(eq(exerciseSlots.id, slotId), eq(exerciseSlots.workoutId, session.workoutId)))
    .limit(1);
  if (!slot) {
    return fail('not-found');
  }
  const [[current], [logged], active] = await Promise.all([
    db
      .select({ variantId: plannedSets.variantId })
      .from(plannedSets)
      .where(
        and(
          eq(plannedSets.exerciseSlotId, slotId),
          eq(plannedSets.trainingBlockId, session.trainingBlockId),
        ),
      )
      .limit(1),
    db
      .select({ total: count() })
      .from(setLogs)
      .where(and(eq(setLogs.workoutSessionId, session.id), eq(setLogs.exerciseSlotId, slotId))),
    listActiveVariants(db, [slot.exerciseId]),
  ]);
  const decision = decideVariantSwitch({
    sessionStatus: session.status,
    loggedSetsInSlot: logged?.total ?? 0,
    currentVariantId: current?.variantId ?? null,
    targetVariantId: input.variantId,
    activeVariantIds: (active.get(slot.exerciseId) ?? []).map((variant) => variant.id),
  });
  if (!decision.ok) {
    return fail(decision.error);
  }
  if (decision.value.kind === 'switch') {
    await runBatch(
      db,
      swapVariantStatements(db, eq(plannedSets.exerciseSlotId, slotId), input.variantId, {
        parkCurrent: true,
      }),
    );
  }
  return succeed(undefined);
}

export function swapVariantStatements(
  db: Database,
  scope: SQL,
  toVariantId: string | null,
  options: { parkCurrent: boolean },
): Statement[] {
  const statements: Statement[] = [];
  if (options.parkCurrent) {
    statements.push(
      db
        .insert(plannedSetVariantWeights)
        .select(
          db
            .select({
              plannedSetId: plannedSets.id,
              variantId: plannedSets.variantId,
              lastWeightGrams: plannedSets.lastWeightGrams,
            })
            .from(plannedSets)
            .where(
              and(scope, isNotNull(plannedSets.variantId), isNotNull(plannedSets.lastWeightGrams)),
            ),
        )
        .onConflictDoUpdate({
          target: [plannedSetVariantWeights.plannedSetId, plannedSetVariantWeights.variantId],
          set: { lastWeightGrams: sql`excluded.last_weight_grams` },
        }),
    );
  }
  statements.push(
    db
      .update(plannedSets)
      .set({
        variantId: toVariantId,
        lastWeightGrams:
          toVariantId === null
            ? null
            : sql`(select ${plannedSetVariantWeights.lastWeightGrams} from ${plannedSetVariantWeights} where ${plannedSetVariantWeights.plannedSetId} = ${plannedSets.id} and ${plannedSetVariantWeights.variantId} = ${toVariantId})`,
      })
      .where(scope),
  );
  if (toVariantId !== null) {
    statements.push(
      db
        .delete(plannedSetVariantWeights)
        .where(
          and(
            eq(plannedSetVariantWeights.variantId, toVariantId),
            inArray(
              plannedSetVariantWeights.plannedSetId,
              db
                .select({ id: plannedSets.id })
                .from(plannedSets)
                .where(eq(plannedSets.variantId, toVariantId)),
            ),
          ),
        ),
    );
  }
  return statements;
}
