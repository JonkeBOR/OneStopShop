export const affirmationCategories = [
  'skipped-whole-workout',
  'skipped-whole-exercise',
  'skipped-sets',
  'fully-completed',
  'fully-completed-with-improvements',
  'fully-completed-with-improvements-on-every-exercise',
] as const;

export type AffirmationCategory = (typeof affirmationCategories)[number];
