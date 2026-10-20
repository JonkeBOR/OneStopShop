import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProgramSummary } from '@/features/fitness-tracker/domain/types';
import { fitnessStrings } from '@/lib/strings/fitness';
import { ProgramsScreen } from './ProgramsScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const programs: ProgramSummary[] = [
  { id: 'p1', name: 'Strength', isActive: true, blockCount: 4, workoutCount: 3 },
  { id: 'p2', name: 'Cut', isActive: false, blockCount: 1, workoutCount: 1 },
];

describe('ProgramsScreen', () => {
  it('FR-025: lists each program with its blocks and workouts, linking to its edit page', () => {
    render(<ProgramsScreen programs={programs} />);

    const strength = screen.getByRole('link', { name: new RegExp('Strength') });
    expect(strength.getAttribute('href')).toBe('/fitness-tracker/programs/p1');
    expect(within(strength).getByText(fitnessStrings.programs.summary(4, 3))).toBeDefined();
    const cut = screen.getByRole('link', { name: new RegExp('Cut') });
    expect(cut.getAttribute('href')).toBe('/fitness-tracker/programs/p2');
    expect(within(cut).getByText(fitnessStrings.programs.summary(1, 1))).toBeDefined();
  });

  it('FR-025: marks only the active program', () => {
    render(<ProgramsScreen programs={programs} />);

    expect(
      within(screen.getByRole('link', { name: new RegExp('Strength') })).getByText(
        fitnessStrings.programEdit.active,
      ),
    ).toBeDefined();
    expect(
      within(screen.getByRole('link', { name: new RegExp('Cut') })).queryByText(
        fitnessStrings.programEdit.active,
      ),
    ).toBeNull();
  });

  it('FR-005: explains what to do when there are no programs, and still offers the + link', () => {
    render(<ProgramsScreen programs={[]} />);

    expect(screen.getByText(fitnessStrings.programs.empty)).toBeDefined();
    expect(screen.getByRole('link', { name: fitnessStrings.programs.add })).toBeDefined();
  });

  it('adds a program from a + link to its own page, not from a form on the list', () => {
    render(<ProgramsScreen programs={programs} />);

    expect(
      screen.getByRole('link', { name: fitnessStrings.programs.add }).getAttribute('href'),
    ).toBe('/fitness-tracker/programs/new');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('FR-003: links back to the fitness tracker', () => {
    render(<ProgramsScreen programs={programs} />);

    expect(
      screen.getByRole('link', { name: fitnessStrings.navigation.toHome }).getAttribute('href'),
    ).toBe('/fitness-tracker');
    expect(
      screen.getByRole('heading', { level: 1, name: fitnessStrings.programs.title }),
    ).toBeDefined();
  });
});
