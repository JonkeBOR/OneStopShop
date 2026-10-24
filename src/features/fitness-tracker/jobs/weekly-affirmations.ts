import type { GenerateJson } from '@/lib/gemini/client';
import type { Database } from '@/lib/server/create-database';
import { affirmationWeekStart } from '../domain/affirmation';
import { readAffirmationSetGeneratedAt, replaceAffirmationSet } from '../server/affirmations';
import { type Sleep, writeAffirmationSet } from './affirmation-writer';

export type WeeklyAffirmationsOutcome = 'disabled' | 'current' | 'failed' | 'replaced';

export async function runWeeklyAffirmations(
  db: Database,
  generate: GenerateJson | null,
  now: Date,
  sleep: Sleep,
): Promise<WeeklyAffirmationsOutcome> {
  if (generate === null) {
    return 'disabled';
  }
  const generatedAt = await readAffirmationSetGeneratedAt(db);
  if (generatedAt !== null && generatedAt >= affirmationWeekStart(now)) {
    return 'current';
  }
  const set = await writeAffirmationSet(generate, sleep);
  if (set === null) {
    return 'failed';
  }
  await replaceAffirmationSet(db, set, now);
  return 'replaced';
}
