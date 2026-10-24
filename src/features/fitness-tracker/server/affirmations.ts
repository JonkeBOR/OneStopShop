import 'server-only';
import { asc, eq, max } from 'drizzle-orm';
import type { Database } from '@/lib/server/database';
import { sessionAchievement } from '../domain/achievement';
import {
  affirmationCategories,
  type AffirmationCategory,
  type AffirmationSet,
  pickAffirmation,
} from '../domain/affirmation';
import type { SessionView } from '../domain/types';
import { chunkRows, runBatch } from './batch';
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

const affirmationColumnCount = 5;

export async function readAffirmationSetGeneratedAt(db: Database): Promise<Date | null> {
  const [row] = await db.select({ latest: max(affirmations.generatedAt) }).from(affirmations);
  return row?.latest ?? null;
}

export async function replaceAffirmationSet(
  db: Database,
  set: AffirmationSet,
  generatedAt: Date,
): Promise<void> {
  const rows = affirmationCategories.flatMap((category) =>
    set[category].map((text, position) => ({
      id: crypto.randomUUID(),
      category,
      position,
      text,
      generatedAt,
    })),
  );
  await runBatch(db, [
    db.delete(affirmations),
    ...chunkRows(rows, affirmationColumnCount).map((chunk) =>
      db.insert(affirmations).values(chunk),
    ),
  ]);
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
