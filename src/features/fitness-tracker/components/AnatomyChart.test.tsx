import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { bodyPartIds } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { AnatomyChart } from './AnatomyChart';

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({ id, name: `Name of ${id}` }));

describe('AnatomyChart', () => {
  it('offers every muscle once as a checkbox named from the catalog', () => {
    render(<AnatomyChart bodyParts={bodyParts} selected={[]} onToggle={vi.fn()} />);

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(bodyParts.map((bodyPart) => bodyPart.name)),
    );
    expect(boxes).toHaveLength(bodyPartIds.length);
    expect(screen.getByRole('group', { name: fitnessStrings.anatomy.chartLabel })).toBeDefined();
  });

  it('checks the selected muscles and leaves the rest unchecked', () => {
    render(
      <AnatomyChart bodyParts={bodyParts} selected={['chest', 'upper-traps']} onToggle={vi.fn()} />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Name of chest' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('checkbox', { name: 'Name of upper-traps' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('checkbox', { name: 'Name of lats' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('highlights a muscle in every view it appears in', () => {
    const { container } = render(
      <AnatomyChart bodyParts={bodyParts} selected={['calves']} onToggle={vi.fn()} />,
    );

    const calves = container.querySelectorAll('[data-muscle="calves"]');
    expect(calves).toHaveLength(2);
    const classes = [...calves].map((group) => group.getAttribute('class'));
    expect(classes[0]).toBe(classes[1]);
    expect(classes[0]).not.toBe(
      container.querySelector('[data-muscle="lats"]')?.getAttribute('class'),
    );
    expect(container.querySelectorAll('[data-muscle="upper-traps"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-muscle="lower-traps"]')).toHaveLength(1);
    expect(screen.getAllByRole('checkbox', { name: 'Name of upper-traps' })).toHaveLength(1);
    expect(screen.getAllByRole('checkbox', { name: 'Name of lower-traps' })).toHaveLength(1);
  });

  it('toggles a muscle on click, Space and Enter, including its copy in the other view', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <AnatomyChart bodyParts={bodyParts} selected={[]} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Name of chest' }));
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Name of lats' }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Name of glutes' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Name of abs' }), { key: 'a' });
    const [, backForearms] = container.querySelectorAll('[data-muscle="forearms"]');
    fireEvent.click(backForearms ?? document.body);

    expect(onToggle.mock.calls).toEqual([['chest'], ['lats'], ['glutes'], ['forearms']]);
  });

  it('is a labelled image with no controls when read-only', () => {
    render(<AnatomyChart bodyParts={bodyParts} selected={['triceps', 'chest']} readOnly />);

    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(
      screen.getByRole('img', {
        name: fitnessStrings.anatomy.summary(['Name of chest', 'Name of triceps']),
      }),
    ).toBeDefined();
  });
});
