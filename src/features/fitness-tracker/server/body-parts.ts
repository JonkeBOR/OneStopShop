import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { type BodyPart, bodyPartIds } from '../domain/body-part';
import { fail, type Result, succeed } from '../domain/result';
import type { BodyPartView } from '../domain/types';
import { bodyParts, exerciseBodyParts, exercises } from './schema';

export function inChartOrder<T>(items: readonly T[], idOf: (item: T) => BodyPart): T[] {
  return items.toSorted(
    (left, right) => bodyPartIds.indexOf(idOf(left)) - bodyPartIds.indexOf(idOf(right)),
  );
}

export async function listBodyParts(db: Database): Promise<BodyPartView[]> {
  const rows = await db.select({ id: bodyParts.id, name: bodyParts.name }).from(bodyParts);
  return inChartOrder(rows, (row) => row.id);
}

async function ownsExercise(db: Database, profileId: string, exerciseId: string): Promise<boolean> {
  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  return exercise !== undefined;
}

export async function linkBodyPart(
  db: Database,
  profileId: string,
  exerciseId: string,
  bodyPart: BodyPart,
): Promise<Result<void, 'not-found'>> {
  if (!(await ownsExercise(db, profileId, exerciseId))) {
    return fail('not-found');
  }
  await db
    .insert(exerciseBodyParts)
    .values({ exerciseId, bodyPartId: bodyPart })
    .onConflictDoNothing();
  return succeed(undefined);
}

export async function unlinkBodyPart(
  db: Database,
  profileId: string,
  exerciseId: string,
  bodyPart: BodyPart,
): Promise<Result<void, 'not-found'>> {
  if (!(await ownsExercise(db, profileId, exerciseId))) {
    return fail('not-found');
  }
  await db
    .delete(exerciseBodyParts)
    .where(
      and(eq(exerciseBodyParts.exerciseId, exerciseId), eq(exerciseBodyParts.bodyPartId, bodyPart)),
    );
  return succeed(undefined);
}
