import type { AffirmationCategory } from './affirmation';
import { estimatedOneRepMaxKg } from './progress-chart';
import type { SessionSlot, SessionView, SetLog } from './types';

export type PreviousBests = ReadonlyMap<string, number>;

type Improvement = 'improved' | 'not-improved' | 'no-history';

export function exerciseVariantKey(exerciseId: string, variantId: string | null): string {
  return `${exerciseId}|${variantId ?? ''}`;
}

export function bestEstimatedOneRepMaxKg(sets: readonly SetLog[]): number | null {
  const estimates = sets.flatMap((set) => {
    const estimate = estimatedOneRepMaxKg(set.reps, set.weightKg);
    return estimate === null ? [] : [estimate];
  });
  return estimates.length === 0 ? null : Math.max(...estimates);
}

function improvementOf(slot: SessionSlot, previousBests: PreviousBests): Improvement {
  const [firstSet] = slot.loggedSets;
  const previous =
    firstSet === undefined
      ? undefined
      : previousBests.get(exerciseVariantKey(slot.exercise.id, firstSet.variantId));
  const current = bestEstimatedOneRepMaxKg(slot.loggedSets);
  if (previous === undefined || current === null) {
    return 'no-history';
  }
  return current > previous ? 'improved' : 'not-improved';
}

export function sessionAchievement(
  session: SessionView,
  previousBests: PreviousBests,
): AffirmationCategory {
  if (session.slots.every((slot) => slot.loggedSets.length === 0)) {
    return 'skipped-whole-workout';
  }
  const required = session.slots.filter((slot) => !slot.isOptional && slot.plannedSets.length > 0);
  if (required.some((slot) => slot.loggedSets.length === 0)) {
    return 'skipped-whole-exercise';
  }
  if (required.some((slot) => slot.loggedSets.length < slot.plannedSets.length)) {
    return 'skipped-sets';
  }
  const withHistory = session.slots
    .filter((slot) => slot.loggedSets.length > 0)
    .map((slot) => improvementOf(slot, previousBests))
    .filter((improvement) => improvement !== 'no-history');
  if (withHistory.length > 0 && withHistory.every((improvement) => improvement === 'improved')) {
    return 'fully-completed-with-improvements-on-every-exercise';
  }
  if (withHistory.includes('improved')) {
    return 'fully-completed-with-improvements';
  }
  return 'fully-completed';
}
