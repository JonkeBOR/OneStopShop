export const affirmationCategories = [
  'skipped-whole-workout',
  'skipped-whole-exercise',
  'skipped-sets',
  'fully-completed',
  'fully-completed-with-improvements',
  'fully-completed-with-improvements-on-every-exercise',
] as const;

export type AffirmationCategory = (typeof affirmationCategories)[number];

const millisecondsPerDay = 86_400_000;
const daysSinceMonday = 6;

export function affirmationWeekStart(at: Date): Date {
  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const daysIntoWeek = (at.getUTCDay() + daysSinceMonday) % 7;
  return new Date(midnight - daysIntoWeek * millisecondsPerDay);
}

export function pickAffirmation(
  texts: readonly string[],
  sessionIndexInWeek: number,
): string | null {
  return texts[sessionIndexInWeek % texts.length] ?? null;
}
