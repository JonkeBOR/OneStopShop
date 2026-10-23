import type { SessionView } from '@/features/fitness-tracker/domain/types';
import { affirmationFor } from '@/features/fitness-tracker/server/affirmations';
import type { Database } from '@/lib/server/database';
import { getGeminiGenerator } from '@/lib/server/gemini';
import { fitnessStrings } from '@/lib/strings/fitness';

type SessionAffirmationProps = {
  db: Database;
  profileId: string;
  session: SessionView;
  now: Date;
};

function randomAffirmation(): string {
  const { affirmations } = fitnessStrings.finished;
  return affirmations[Math.floor(Math.random() * affirmations.length)] ?? affirmations[0];
}

export async function SessionAffirmation({ db, profileId, session, now }: SessionAffirmationProps) {
  const text = await affirmationFor(db, profileId, session, now, getGeminiGenerator());
  return text ?? randomAffirmation();
}
