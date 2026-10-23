import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { dailyAffirmationCap } from '../domain/affirmation';
import { workoutSessions } from './schema';

const dayInMilliseconds = 86_400_000;

export async function readAffirmation(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ affirmation: workoutSessions.affirmation })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.profileId, profileId)));
  return row?.affirmation ?? null;
}

export async function claimAffirmation(
  db: Database,
  profileId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const windowStart = now.getTime() - dayInMilliseconds;
  const rows = await db
    .update(workoutSessions)
    .set({ affirmationRequestedAt: now })
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.profileId, profileId),
        eq(workoutSessions.status, 'finished'),
        isNull(workoutSessions.affirmationRequestedAt),
        sql`(select count(*) from workout_sessions as recent
          where recent.profile_id = ${profileId}
            and recent.affirmation_requested_at > ${windowStart}) < ${dailyAffirmationCap}`,
      ),
    )
    .returning({ id: workoutSessions.id });
  return rows.length === 1;
}

export async function saveAffirmation(
  db: Database,
  profileId: string,
  sessionId: string,
  text: string,
): Promise<void> {
  await db
    .update(workoutSessions)
    .set({ affirmation: text })
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.profileId, profileId),
        isNull(workoutSessions.affirmation),
      ),
    );
}
