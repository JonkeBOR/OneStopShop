import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import type { GenerateJson } from '@/lib/server/gemini';
import {
  affirmationFacts,
  dailyAffirmationCap,
  parseAffirmation,
  type AffirmationFacts,
} from '../domain/affirmation';
import type { SessionView } from '../domain/types';
import { workoutSessions } from './schema';

const dayInMilliseconds = 86_400_000;

export const affirmationSystemPrompt = `Write one unhinged, absurdly over-the-top positive affirmation for someone who just finished a strength workout. The user message is a JSON object with the facts of that workout.

Rules:
- One or two sentences, at most 160 characters.
- Positive about the person and the workout. No insults, and never mock the person.
- Use only the facts given. Never invent numbers, records or exercises.
- No medical, health, diet or body-shape claims.
- English, no hashtags, at most one emoji.

Examples of the voice. Their numbers are not today's facts:
- You moved 4,200 kg today. Somewhere a forklift is filing a complaint.
- Eighteen sets of bench press. The bar has asked for a restraining order.
- 64 minutes of war against gravity, and gravity lost.
- Three sets of dips and the parallel bars are drafting your biography. 💪

Reply as JSON: {"affirmation": "<text>"}.`;

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

export async function writeAffirmation(
  generate: GenerateJson,
  facts: AffirmationFacts,
): Promise<string | null> {
  const answer = await generate({
    systemInstruction: affirmationSystemPrompt,
    userMessage: JSON.stringify(facts),
    responseSchema: {
      type: 'OBJECT',
      properties: { affirmation: { type: 'STRING' } },
      required: ['affirmation'],
    },
  });
  return parseAffirmation(answer);
}

export async function affirmationFor(
  db: Database,
  profileId: string,
  session: SessionView,
  now: Date,
  generate: GenerateJson | null,
): Promise<string | null> {
  const stored = await readAffirmation(db, profileId, session.id);
  if (stored !== null) {
    return stored;
  }
  if (generate === null) {
    return null;
  }
  if (!(await claimAffirmation(db, profileId, session.id, now))) {
    return null;
  }
  const written = await writeAffirmation(generate, affirmationFacts(session));
  if (written !== null) {
    await saveAffirmation(db, profileId, session.id, written);
  }
  return written;
}
