import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { FilterLinks } from './FilterLinks';

const ranges = fitnessStrings.progress.ranges;

const links = [
  { key: '3m', text: ranges['3m'], href: '/fitness-tracker?range=3m', isSelected: false },
  { key: '1y', text: ranges['1y'], href: '/fitness-tracker?range=1y', isSelected: true },
  { key: 'all', text: ranges.all, href: '/fitness-tracker?range=all', isSelected: false },
];

describe('FilterLinks', () => {
  it('renders a named navigation with one link per entry', () => {
    render(<FilterLinks label={fitnessStrings.progress.rangeLabel} links={links} />);

    const navigation = screen.getByRole('navigation', { name: fitnessStrings.progress.rangeLabel });
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/fitness-tracker?range=3m',
      '/fitness-tracker?range=1y',
      '/fitness-tracker?range=all',
    ]);
  });

  it('marks only the selected link as the current page', () => {
    render(<FilterLinks label={fitnessStrings.progress.rangeLabel} links={links} />);

    expect(
      screen
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('aria-current')]),
    ).toEqual([
      [ranges['3m'], null],
      [ranges['1y'], 'page'],
      [ranges.all, null],
    ]);
  });
});
