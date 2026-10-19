import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fitnessStrings } from '@/lib/strings/fitness';
import { bodyPartIds } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { AnatomyChart } from './AnatomyChart';

function descriptionOf(element: Element): string | null {
  const ids = element.getAttribute('aria-describedby');
  return ids === null
    ? null
    : ids
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
}

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({ id, name: `Name of ${id}` }));

describe('AnatomyChart', () => {
  it('offers every muscle once as a checkbox named from the catalog', () => {
    render(<AnatomyChart bodyParts={bodyParts} highlights={{}} onToggle={vi.fn()} />);

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(bodyParts.map((bodyPart) => bodyPart.name)),
    );
    expect(boxes).toHaveLength(bodyPartIds.length);
    expect(screen.getByRole('group', { name: fitnessStrings.anatomy.chartLabel })).toBeDefined();
  });

  it('checks the selected muscles and leaves the rest unchecked', () => {
    render(
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={{ chest: 'primary', 'upper-traps': 'secondary' }}
        onToggle={vi.fn()}
      />,
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
      <AnatomyChart bodyParts={bodyParts} highlights={{ calves: 'primary' }} onToggle={vi.fn()} />,
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
      <AnatomyChart bodyParts={bodyParts} highlights={{}} onToggle={onToggle} />,
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
    render(
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={{ triceps: 'secondary', chest: 'primary' }}
        readOnly
      />,
    );

    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(
      screen.getByRole('img', {
        name: fitnessStrings.anatomy.summary(['Name of chest', 'Name of triceps']),
      }),
    ).toBeDefined();
  });

  it('gives each highlight its own class', () => {
    const { container } = render(
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={{
          chest: 'primary',
          lats: 'secondary',
          quads: 'low',
          glutes: 'target',
          calves: 'high',
        }}
        readOnly
      />,
    );

    const classOf = (part: string) =>
      container.querySelector(`[data-muscle="${part}"]`)?.getAttribute('class');
    const classes = ['chest', 'lats', 'quads', 'glutes', 'calves', 'abs'].map(classOf);
    expect(new Set(classes).size).toBe(6);
  });

  it("describes a linked muscle's role and leaves its name alone", () => {
    render(
      <AnatomyChart bodyParts={bodyParts} highlights={{ chest: 'secondary' }} onToggle={vi.fn()} />,
    );

    const chest = screen.getByRole('checkbox', { name: 'Name of chest' });
    expect(chest.getAttribute('aria-checked')).toBe('true');
    expect(descriptionOf(chest)).toBe(fitnessStrings.anatomy.roles.secondary);
    expect(descriptionOf(screen.getByRole('checkbox', { name: 'Name of lats' }))).toBeNull();
  });

  it('names the read-only chart with the given label', () => {
    render(
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={{ chest: 'low' }}
        readOnly
        label="Volume label"
      />,
    );

    expect(screen.getByRole('img', { name: 'Volume label' })).toBeDefined();
  });

  it('shows no legend unless one is given', () => {
    const interactive = render(
      <AnatomyChart bodyParts={bodyParts} highlights={{ chest: 'primary' }} onToggle={vi.fn()} />,
    );
    expect(interactive.container.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(interactive.queryByRole('list')).toBeNull();
    interactive.unmount();

    const readOnly = render(<AnatomyChart bodyParts={bodyParts} readOnly />);
    expect(readOnly.container.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(readOnly.queryByRole('list')).toBeNull();
  });

  it("shows each legend entry with its label and a swatch in the highlight's colour", () => {
    const { container } = render(
      <AnatomyChart
        bodyParts={bodyParts}
        highlights={{ chest: 'target' }}
        readOnly
        legend={[
          { highlight: null, label: 'Plain' },
          { highlight: 'target', label: 'Good' },
        ]}
      />,
    );

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Plain', 'Good']);
    const swatchClass = (item: HTMLElement) => item.querySelector('rect')?.getAttribute('class');
    expect(swatchClass(items[1] ?? document.body)).toBe(
      container.querySelector('[data-muscle="chest"]')?.getAttribute('class'),
    );
    expect(swatchClass(items[0] ?? document.body)).toBe(
      container.querySelector('[data-muscle="lats"]')?.getAttribute('class'),
    );
  });

  it('draws a plain read-only chart with no highlights', () => {
    const { container } = render(<AnatomyChart bodyParts={bodyParts} readOnly />);

    expect(screen.getByRole('img', { name: fitnessStrings.anatomy.summary([]) })).toBeDefined();
    const classes = new Set(
      [...container.querySelectorAll('[data-muscle]')].map((group) => group.getAttribute('class')),
    );
    expect(classes.size).toBe(1);
  });
});
