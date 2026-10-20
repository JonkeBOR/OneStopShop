import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { NewProgramScreen } from './NewProgramScreen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

describe('NewProgramScreen', () => {
  it('asks only for the name, with a Submit button', () => {
    render(<NewProgramScreen />);

    expect(
      screen.getByRole('heading', { level: 1, name: fitnessStrings.programEdit.newTitle }),
    ).toBeDefined();
    expect(screen.getAllByRole('textbox')).toEqual([
      screen.getByRole('textbox', { name: fitnessStrings.programEdit.nameLabel }),
    ]);
    expect(screen.getByRole('button', { name: fitnessStrings.common.submit })).toBeDefined();
    expect(screen.getByText(fitnessStrings.programEdit.nameFirst)).toBeDefined();
  });

  it('cancels by going back to the list', () => {
    render(<NewProgramScreen />);

    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toPrograms }).getAttribute('href'),
    ).toBe('/fitness-tracker/programs');
  });
});
