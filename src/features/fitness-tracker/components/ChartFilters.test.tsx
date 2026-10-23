import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { ChartFilters } from './ChartFilters';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const progress = fitnessStrings.progress;

const rangeFilter = {
  label: progress.rangeLabel,
  value: '1y',
  options: [
    { value: '3m', text: progress.ranges['3m'], href: '/fitness-tracker?range=3m' },
    { value: '1y', text: progress.ranges['1y'], href: '/fitness-tracker?range=1y' },
    { value: 'all', text: progress.ranges.all, href: '/fitness-tracker?range=all' },
  ],
};

const variantFilter = {
  label: progress.variantLabel,
  value: 'v1',
  options: [
    { value: 'v1', text: 'Gym A', href: '/e1?variant=v1' },
    { value: 'v2', text: 'Gym B', href: '/e1?variant=v2' },
  ],
};

describe('ChartFilters', () => {
  afterEach(() => {
    router.push.mockReset();
  });

  it('renders one named dropdown per filter with its options and current value', () => {
    render(<ChartFilters filters={[rangeFilter, variantFilter]} />);

    const range = screen.getByRole<HTMLSelectElement>('combobox', { name: progress.rangeLabel });
    expect(
      within(range)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([progress.ranges['3m'], progress.ranges['1y'], progress.ranges.all]);
    expect(range.value).toBe('1y');
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: progress.variantLabel }).value,
    ).toBe('v1');
  });

  it('navigates to the chosen option without scrolling', () => {
    render(<ChartFilters filters={[rangeFilter]} />);

    fireEvent.change(screen.getByRole('combobox', { name: progress.rangeLabel }), {
      target: { value: 'all' },
    });

    expect(router.push).toHaveBeenCalledWith('/fitness-tracker?range=all', { scroll: false });
  });
});
