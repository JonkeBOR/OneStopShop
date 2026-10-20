import { fail, type Result, succeed } from './result';

export function canUseInSlot(exercise: {
  isArchived: boolean;
  isInWorkout: boolean;
}): Result<true, 'exercise-archived' | 'exercise-already-in-workout'> {
  if (exercise.isArchived) {
    return fail('exercise-archived');
  }
  return exercise.isInWorkout ? fail('exercise-already-in-workout') : succeed(true);
}

export function exercisesAvailableFor<Item extends { id: string }>(
  exercises: readonly Item[],
  slots: readonly { id: string; exercise: { id: string } }[],
  replacingSlotId: string | null = null,
): Item[] {
  const taken = new Set(
    slots.filter((slot) => slot.id !== replacingSlotId).map((slot) => slot.exercise.id),
  );
  return exercises.filter((exercise) => !taken.has(exercise.id));
}
