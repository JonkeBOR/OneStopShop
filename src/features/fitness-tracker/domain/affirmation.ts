export const affirmationCategories = [
  'skipped-whole-workout',
  'skipped-whole-exercise',
  'skipped-sets',
  'fully-completed',
  'fully-completed-with-improvements',
  'fully-completed-with-improvements-on-every-exercise',
] as const;

export type AffirmationCategory = (typeof affirmationCategories)[number];

export type AffirmationSet = Readonly<Record<AffirmationCategory, readonly string[]>>;

export const affirmationMaxWords = 15;
export const affirmationMaxLength = 120;
export const affirmationsPerCategory = 7;

function cleanLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed === '' ||
    trimmed.length > affirmationMaxLength ||
    /[\r\n]/.test(trimmed) ||
    trimmed.split(/\s+/).length > affirmationMaxWords
  ) {
    return null;
  }
  return trimmed;
}

export function parseAffirmationSet(value: unknown): AffirmationSet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const answer = value as Readonly<Record<string, unknown>>;
  const seen = new Set<string>();
  const set: Partial<Record<AffirmationCategory, string[]>> = {};
  for (const category of affirmationCategories) {
    const items = answer[category];
    if (!Array.isArray(items)) {
      return null;
    }
    const kept: string[] = [];
    for (const item of items as unknown[]) {
      const line = cleanLine(item);
      const key = line?.toLowerCase();
      if (line === null || key === undefined || seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (kept.length < affirmationsPerCategory) {
        kept.push(line);
      }
    }
    if (kept.length < affirmationsPerCategory) {
      return null;
    }
    set[category] = kept;
  }
  return set as AffirmationSet;
}

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
