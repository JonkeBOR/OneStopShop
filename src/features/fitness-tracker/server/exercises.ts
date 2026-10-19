import 'server-only';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { exerciseNameKey } from '../domain/exercise';
import { fail, type Result, succeed } from '../domain/result';
import type { Exercise, ExerciseUsage } from '../domain/types';
import { parseName } from '../domain/values';
import { isUniqueConstraintViolation } from './batch';
import { inChartOrder } from './body-parts';
import { toExercise } from './mapping';
import { exerciseBodyParts, exerciseSlots, exercises, programs, setLogs, workouts } from './schema';

type NameError = 'name-required' | 'name-too-long' | 'name-taken';

export async function listExercises(
  db: Database,
  profileId: string,
  options: { includeArchived: boolean },
): Promise<Exercise[]> {
  const scope = options.includeArchived
    ? eq(exercises.profileId, profileId)
    : and(eq(exercises.profileId, profileId), isNull(exercises.archivedAt));
  const rows = await db.select().from(exercises).where(scope).orderBy(asc(exercises.nameKey));
  return rows.map(toExercise);
}

export async function addExercise(
  db: Database,
  profileId: string,
  input: { name: string },
  now: Date,
): Promise<Result<Exercise, NameError>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  const nameKey = exerciseNameKey(name.value);
  const [taken] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.profileId, profileId), eq(exercises.nameKey, nameKey)))
    .limit(1);
  if (taken) {
    return fail('name-taken');
  }
  const row = {
    id: crypto.randomUUID(),
    profileId,
    name: name.value,
    nameKey,
    archivedAt: null,
    createdAt: now,
  };
  try {
    await db.insert(exercises).values(row);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return fail('name-taken');
    }
    throw error;
  }
  return succeed(toExercise(row));
}

export async function renameExercise(
  db: Database,
  profileId: string,
  exerciseId: string,
  input: { name: string },
): Promise<Result<Exercise, NameError | 'not-found'>> {
  const name = parseName(input.name);
  if (!name.ok) {
    return fail(name.error);
  }
  const nameKey = exerciseNameKey(name.value);
  const [taken] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.profileId, profileId),
        eq(exercises.nameKey, nameKey),
        ne(exercises.id, exerciseId),
      ),
    )
    .limit(1);
  if (taken) {
    return fail('name-taken');
  }
  try {
    const [row] = await db
      .update(exercises)
      .set({ name: name.value, nameKey })
      .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
      .returning();
    return row ? succeed(toExercise(row)) : fail('not-found');
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return fail('name-taken');
    }
    throw error;
  }
}

async function setArchivedAt(
  db: Database,
  profileId: string,
  exerciseId: string,
  archivedAt: Date | null,
): Promise<Result<Exercise, 'not-found'>> {
  const [row] = await db
    .update(exercises)
    .set({ archivedAt })
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .returning();
  return row ? succeed(toExercise(row)) : fail('not-found');
}

export function archiveExercise(
  db: Database,
  profileId: string,
  exerciseId: string,
  now: Date,
): Promise<Result<Exercise, 'not-found'>> {
  return setArchivedAt(db, profileId, exerciseId, now);
}

export function unarchiveExercise(
  db: Database,
  profileId: string,
  exerciseId: string,
): Promise<Result<Exercise, 'not-found'>> {
  return setArchivedAt(db, profileId, exerciseId, null);
}

export async function deleteExercise(
  db: Database,
  profileId: string,
  exerciseId: string,
): Promise<Result<void, 'not-found' | 'exercise-in-use'>> {
  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  if (!exercise) {
    return fail('not-found');
  }
  const [slot] = await db
    .select({ id: exerciseSlots.id })
    .from(exerciseSlots)
    .where(eq(exerciseSlots.exerciseId, exerciseId))
    .limit(1);
  const [log] = await db
    .select({ id: setLogs.id })
    .from(setLogs)
    .where(and(eq(setLogs.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
    .limit(1);
  if (slot || log) {
    return fail('exercise-in-use');
  }
  await db.delete(exercises).where(eq(exercises.id, exerciseId));
  return succeed(undefined);
}

export async function getExerciseUsage(
  db: Database,
  profileId: string,
  exerciseId: string,
): Promise<Result<ExerciseUsage, 'not-found'>> {
  const [exercise] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  if (!exercise) {
    return fail('not-found');
  }
  const [slots, [log], links] = await Promise.all([
    db
      .selectDistinct({
        programId: programs.id,
        programName: programs.name,
        workoutId: workouts.id,
        workoutName: workouts.name,
        workoutPosition: workouts.position,
      })
      .from(exerciseSlots)
      .innerJoin(workouts, eq(workouts.id, exerciseSlots.workoutId))
      .innerJoin(programs, eq(programs.id, workouts.programId))
      .where(and(eq(exerciseSlots.exerciseId, exerciseId), eq(programs.profileId, profileId)))
      .orderBy(asc(programs.name), asc(workouts.position)),
    db
      .select({ id: setLogs.id })
      .from(setLogs)
      .where(and(eq(setLogs.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
      .limit(1),
    db
      .select({ bodyPartId: exerciseBodyParts.bodyPartId })
      .from(exerciseBodyParts)
      .where(eq(exerciseBodyParts.exerciseId, exerciseId)),
  ]);
  return succeed({
    exercise: toExercise(exercise),
    slots: slots.map(({ programId, programName, workoutId, workoutName }) => ({
      programId,
      programName,
      workoutId,
      workoutName,
    })),
    hasSetLogs: log !== undefined,
    bodyParts: inChartOrder(
      links.map((link) => link.bodyPartId),
      (bodyPart) => bodyPart,
    ),
  });
}
