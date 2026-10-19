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

export const bodyPartRoles = ['primary', 'secondary'] as const;

export type BodyPartRole = (typeof bodyPartRoles)[number];

export function isBodyPartRole(value: unknown): value is BodyPartRole {
  return bodyPartRoles.some((role) => role === value);
}

export type BodyPartLink = { bodyPart: BodyPart; role: BodyPartRole };
