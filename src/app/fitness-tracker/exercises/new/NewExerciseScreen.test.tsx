import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { NewExerciseScreen } from './NewExerciseScreen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

describe('NewExerciseScreen', () => {
  it('asks only for the name, with a Submit button', () => {
    render(<NewExerciseScreen />);

    expect(
      screen.getByRole('heading', { level: 1, name: fitnessStrings.exerciseEdit.newTitle }),
    ).toBeDefined();
    expect(screen.getAllByRole('textbox')).toEqual([
      screen.getByRole('textbox', { name: fitnessStrings.exerciseEdit.nameLabel }),
    ]);
    expect(screen.getByRole('button', { name: fitnessStrings.common.submit })).toBeDefined();
    expect(screen.getByText(fitnessStrings.exerciseEdit.nameFirst)).toBeDefined();
  });

  it('cancels by going back to the list', () => {
    render(<NewExerciseScreen />);

    expect(
      screen
        .getByRole('link', { name: fitnessStrings.navigation.toExercises })
        .getAttribute('href'),
    ).toBe('/fitness-tracker/exercises');
  });
});
