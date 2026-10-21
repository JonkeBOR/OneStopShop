import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { LegendEntry } from '../domain/progress-chart';
import { ProgramLegend } from './ProgramLegend';

const entries: LegendEntry[] = [
  { programId: 'p1', name: 'PPL', isDeleted: false, colorIndex: 0 },
  { programId: 'p2', name: 'PPL', isDeleted: true, colorIndex: 1 },
];

describe('ProgramLegend', () => {
  it('names each program and marks a deleted one', () => {
    render(<ProgramLegend entries={entries} />);

    const list = screen.getByRole('list', { name: fitnessStrings.progress.legendLabel });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['PPL', fitnessStrings.progress.deletedProgram('PPL')]);
  });

  it('renders no list when there are no programs', () => {
    render(<ProgramLegend entries={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
  });
});
