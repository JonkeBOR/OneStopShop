export const bodyPartIds = [
  'upper-traps',
  'lower-traps',
  'front-delts',
  'side-delts',
  'rear-delts',
  'chest',
  'biceps',
  'triceps',
  'forearms',
  'serratus',
  'abs',
  'obliques',
  'lats',
  'lower-back',
  'glutes',
  'quads',
  'adductors',
  'hamstrings',
  'calves',
  'tibialis',
] as const;

export type BodyPart = (typeof bodyPartIds)[number];

export function isBodyPart(value: unknown): value is BodyPart {
  return bodyPartIds.some((id) => id === value);
}
