import 'server-only';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { sessionAchievement } from '../domain/achievement';
import { type AffirmationCategory, pickAffirmation } from '../domain/affirmation';
import type { SessionView } from '../domain/types';
import { getPreviousBests } from './history';
import { affirmations } from './schema';
import { countEarlierSessionsThisWeek } from './training';

export async function readAffirmations(
  db: Database,
  category: AffirmationCategory,
): Promise<string[]> {
  const rows = await db
    .select({ text: affirmations.text })
    .from(affirmations)
    .where(eq(affirmations.category, category))
    .orderBy(asc(affirmations.position));
  return rows.map((row) => row.text);
}

export async function finishedSessionAffirmation(
  db: Database,
  profileId: string,
  session: SessionView,
): Promise<string | null> {
  try {
    const category = sessionAchievement(session, await getPreviousBests(db, profileId, session));
    const texts = await readAffirmations(db, category);
    if (texts.length === 0) {
      return null;
    }
    return pickAffirmation(texts, await countEarlierSessionsThisWeek(db, profileId, session));
  } catch {
    console.warn('Affirmation failed: storage');
    return null;
  }
}
