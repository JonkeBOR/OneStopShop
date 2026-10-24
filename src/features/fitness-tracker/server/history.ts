import 'server-only';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import {
  bestEstimatedOneRepMaxKg,
  exerciseVariantKey,
  type PreviousBests,
} from '../domain/achievement';
import { fail, type Result, succeed } from '../domain/result';
import type { Exercise, SessionView, SetLog } from '../domain/types';
import { toExercise, toSetLog } from './mapping';
import { exercises, setLogs, workoutSessions } from './schema';

export async function getExerciseHistory(
  db: Database,
  profileId: string,
  exerciseId: string,
): Promise<Result<{ exercise: Exercise; setLogs: SetLog[] }, 'not-found'>> {
  const [exercise] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.profileId, profileId)))
    .limit(1);
  if (!exercise) {
    return fail('not-found');
  }
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(asc(setLogs.performedAt), sql`rowid`);
  return succeed({ exercise: toExercise(exercise), setLogs: rows.map(toSetLog) });
}

export async function getPreviousBests(
  db: Database,
  profileId: string,
  session: SessionView,
): Promise<PreviousBests> {
  const exerciseIds = [
    ...new Set(
      session.slots.filter((slot) => slot.loggedSets.length > 0).map((slot) => slot.exercise.id),
    ),
  ];
  if (exerciseIds.length === 0 || session.finishedAt === null) {
    return new Map();
  }
  const rows = await db
    .select({ log: setLogs })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.workoutSessionId))
    .where(
      and(
        eq(setLogs.profileId, profileId),
        inArray(setLogs.exerciseId, exerciseIds),
        eq(workoutSessions.status, 'finished'),
        ne(workoutSessions.id, session.id),
        lt(workoutSessions.finishedAt, session.finishedAt),
      ),
    )
    .orderBy(desc(workoutSessions.finishedAt), desc(workoutSessions.id));
  const latestSessionByKey = new Map<string, string>();
  const latestLogsByKey = new Map<string, SetLog[]>();
  for (const log of rows.map((row) => toSetLog(row.log))) {
    const key = exerciseVariantKey(log.exerciseId, log.variantId);
    const latestSession = latestSessionByKey.get(key) ?? log.context.workoutSessionId;
    latestSessionByKey.set(key, latestSession);
    if (latestSession === log.context.workoutSessionId) {
      latestLogsByKey.set(key, [...(latestLogsByKey.get(key) ?? []), log]);
    }
  }
  const bests = new Map<string, number>();
  for (const [key, logs] of latestLogsByKey) {
    const best = bestEstimatedOneRepMaxKg(logs);
    if (best !== null) {
      bests.set(key, best);
    }
  }
  return bests;
}
