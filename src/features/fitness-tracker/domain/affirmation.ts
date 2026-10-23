import type { SessionView } from './types';

export const dailyAffirmationCap = 10;
export const affirmationMaxLength = 200;

const millisecondsPerMinute = 60000;

export type AffirmationFacts = {
  workout: string;
  block: number | null;
  durationMinutes: number | null;
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;
  exercises: { name: string; sets: number; topWeightKg: number | null }[];
};

export function affirmationFacts(session: SessionView): AffirmationFacts {
  const performed = session.slots.filter((slot) => slot.loggedSets.length > 0);
  const sets = performed.flatMap((slot) => slot.loggedSets);

  return {
    workout: session.workout.name,
    block: session.block.number,
    durationMinutes:
      session.finishedAt === null
        ? null
        : Math.round(
            (session.finishedAt.getTime() - session.startedAt.getTime()) / millisecondsPerMinute,
          ),
    totalSets: sets.length,
    totalReps: sets.reduce((total, set) => total + set.reps, 0),
    totalVolumeKg: Math.round(
      sets.reduce((total, set) => total + (set.weightKg === null ? 0 : set.reps * set.weightKg), 0),
    ),
    exercises: performed.map((slot) => {
      const weights = slot.loggedSets.flatMap((set) =>
        set.weightKg === null ? [] : [set.weightKg],
      );
      return {
        name: slot.exercise.name,
        sets: slot.loggedSets.length,
        topWeightKg: weights.length === 0 ? null : Math.max(...weights),
      };
    }),
  };
}

export function parseAffirmation(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('affirmation' in value)) {
    return null;
  }
  const text = value.affirmation;
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > affirmationMaxLength || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}
