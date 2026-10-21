import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import type { ProgramSession } from '../domain/progress-chart';
import type { ExerciseVariant } from '../domain/types';
import { toExerciseVariant } from './mapping';
import { exerciseVariants, exercises, programs, workoutSessions } from './schema';

export async function listProgramSessions(
  db: Database,
  profileId: string,
): Promise<ProgramSession[]> {
  const rows = await db
    .select({
      programId: workoutSessions.programId,
      programName: programs.name,
      deletedAt: programs.deletedAt,
      startedAt: workoutSessions.startedAt,
    })
    .from(workoutSessions)
    .innerJoin(programs, eq(programs.id, workoutSessions.programId))
    .where(eq(workoutSessions.profileId, profileId))
    .orderBy(asc(workoutSessions.startedAt), sql`${workoutSessions}.rowid`);
  return rows.map((row) => ({
    programId: row.programId,
    programName: row.programName,
    isDeleted: row.deletedAt !== null,
    startedAt: row.startedAt,
  }));
}

export async function listAllVariants(
  db: Database,
  profileId: string,
  exerciseId: string,
): Promise<ExerciseVariant[]> {
  const rows = await db
    .select({ variant: exerciseVariants })
    .from(exerciseVariants)
    .innerJoin(exercises, eq(exercises.id, exerciseVariants.exerciseId))
    .where(and(eq(exerciseVariants.exerciseId, exerciseId), eq(exercises.profileId, profileId)))
    .orderBy(asc(exerciseVariants.createdAt), asc(exerciseVariants.id));
  return rows.map((row) => toExerciseVariant(row.variant));
}
