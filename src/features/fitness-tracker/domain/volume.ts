import { type BodyPart, type BodyPartLink, type BodyPartRole, bodyPartIds } from './body-part';
import type { WorkoutView } from './types';

export const setWeights: Record<BodyPartRole, number> = { primary: 1, secondary: 0.5 };

export const volumeBands = { low: 10, high: 20 } as const;

export const volumeLevels = ['none', 'low', 'target', 'high'] as const;

export type VolumeLevel = (typeof volumeLevels)[number];

export function volumeLevel(sets: number): VolumeLevel {
  if (sets === 0) {
    return 'none';
  }
  if (sets < volumeBands.low) {
    return 'low';
  }
  return sets <= volumeBands.high ? 'target' : 'high';
}

export function weeklyVolume(
  workouts: readonly WorkoutView[],
  blockId: string,
  linksByExercise: ReadonlyMap<string, readonly BodyPartLink[]>,
): Record<BodyPart, number> {
  const sets = Object.fromEntries(bodyPartIds.map((id) => [id, 0])) as Record<BodyPart, number>;
  for (const slot of workouts.flatMap((workout) => workout.slots)) {
    if (slot.isOptional) {
      continue;
    }
    const plannedSets =
      slot.prescriptions.find((prescription) => prescription.blockId === blockId)?.plannedSets
        .length ?? 0;
    for (const link of linksByExercise.get(slot.exercise.id) ?? []) {
      sets[link.bodyPart] += plannedSets * setWeights[link.role];
    }
  }
  return sets;
}
