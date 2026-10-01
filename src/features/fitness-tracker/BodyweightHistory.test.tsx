import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import { BodyweightHistory } from './BodyweightHistory';

test('renders the empty state when there are no measurements', () => {
  render(<BodyweightHistory measurements={[]} />);

  expect(screen.getByText(fitnessTrackerStrings.emptyHistory)).toBeDefined();
});

test('renders each measurement’s date and weight', () => {
  render(
    <BodyweightHistory
      measurements={[
        {
          id: '1',
          recordedOn: '2026-03-05',
          kilograms: 82.4,
          createdAt: '2026-03-05T06:00:00.000Z',
        },
        { id: '2', recordedOn: '2026-03-01', kilograms: 83, createdAt: '2026-03-01T06:00:00.000Z' },
      ]}
    />,
  );

  expect(screen.getByText('2026-03-05')).toBeDefined();
  expect(screen.getByText('82.4 kg')).toBeDefined();
  expect(screen.getByText('2026-03-01')).toBeDefined();
  expect(screen.getByText('83 kg')).toBeDefined();
});
