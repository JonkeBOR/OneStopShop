import { describe, expect, it } from 'vitest';
import { canUseInSlot, exercisesAvailableFor } from './exercise';

describe('canUseInSlot', () => {
  it('accepts an active exercise that is not in the workout yet', () => {
    expect(canUseInSlot({ isArchived: false, isInWorkout: false })).toEqual({
      ok: true,
      value: true,
    });
  });

  it('refuses an archived exercise', () => {
    expect(canUseInSlot({ isArchived: true, isInWorkout: false })).toEqual({
      ok: false,
      error: 'exercise-archived',
    });
  });

  it('refuses an exercise the workout already has', () => {
    expect(canUseInSlot({ isArchived: false, isInWorkout: true })).toEqual({
      ok: false,
      error: 'exercise-already-in-workout',
    });
  });
});

describe('exercisesAvailableFor', () => {
  const exercises = [
    { id: 'e1', name: 'Bench' },
    { id: 'e2', name: 'Row' },
    { id: 'e3', name: 'Curl' },
  ];
  const slots = [
    { id: 's1', exercise: { id: 'e1' } },
    { id: 's2', exercise: { id: 'e3' } },
  ];

  it('leaves out the exercises the workout already has', () => {
    expect(exercisesAvailableFor(exercises, slots)).toEqual([{ id: 'e2', name: 'Row' }]);
  });

  it('keeps the exercise of the slot being replaced', () => {
    expect(exercisesAvailableFor(exercises, slots, 's1').map((exercise) => exercise.id)).toEqual([
      'e1',
      'e2',
    ]);
  });
});
