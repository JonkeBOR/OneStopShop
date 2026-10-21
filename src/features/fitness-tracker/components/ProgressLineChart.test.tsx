import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import type { ChartDomain, ChartPoint } from '../domain/progress-chart';
import { ProgressLineChart } from './ProgressLineChart';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const label = fitnessStrings.progress.bodyweight.chartLabel;
const domain: ChartDomain = [Date.parse('2026-07-21'), Date.parse('2026-10-22')];

describe('ProgressLineChart', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    return () => vi.unstubAllGlobals();
  });

  it('renders a figure named by its label', () => {
    const points: ChartPoint[] = [
      { time: Date.parse('2026-08-01T12:00:00Z'), kg: 82.4 },
      { time: Date.parse('2026-09-01T12:00:00Z'), kg: 81.1 },
    ];

    render(
      <ProgressLineChart
        label={label}
        points={points}
        domain={domain}
        bands={[
          {
            from: domain[0],
            to: domain[1],
            programId: 'p1',
            name: 'PPL',
            isDeleted: false,
            colorIndex: 0,
          },
        ]}
      />,
    );

    expect(screen.getByRole('figure', { name: label })).toBeDefined();
  });

  it('renders for a single point', () => {
    render(
      <ProgressLineChart
        label={label}
        points={[{ time: Date.parse('2026-08-01T12:00:00Z'), kg: 82.4 }]}
        domain={domain}
      />,
    );

    expect(screen.getByRole('figure', { name: label })).toBeDefined();
  });
});
