export const fitnessErrorCodes = [
  'unauthorized',
  'unexpected',
  'not-found',
  'invalid-body',
  'name-required',
  'name-too-long',
  'name-taken',
  'invalid-weight',
  'invalid-reps',
  'invalid-target',
  'invalid-block-count',
  'invalid-time-zone',
  'invalid-position',
  'invalid-block',
  'prescription-needs-a-set',
  'slot-periodized',
  'slot-not-periodized',
  'already-weighed-in-today',
  'exercise-in-use',
  'exercise-archived',
  'exercise-already-in-workout',
  'program-active',
  'program-needs-a-block',
  'program-incomplete',
  'no-active-program',
  'workout-not-in-active-program',
  'workout-already-finished',
  'session-not-in-progress',
  'planned-set-not-in-session',
  'set-already-logged',
  'variant-locked',
  'variant-changed',
  'last-variant',
] as const;

export type FitnessErrorCode = (typeof fitnessErrorCodes)[number];

export function isFitnessErrorCode(value: unknown): value is FitnessErrorCode {
  return fitnessErrorCodes.some((code) => code === value);
}
