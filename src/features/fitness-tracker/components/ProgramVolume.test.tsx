import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type BodyPart, bodyPartIds } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { type BlockVolume, ProgramVolume } from './ProgramVolume';

const names: Partial<Record<BodyPart, string>> = {
  chest: 'Chest',
  triceps: 'Triceps',
  biceps: 'Biceps',
};

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({
  id,
  name: names[id] ?? `Name of ${id}`,
}));

function setsOf(overrides: Partial<Record<BodyPart, number>>): Record<BodyPart, number> {
  return { ...Object.fromEntries(bodyPartIds.map((id) => [id, 0])), ...overrides } as Record<
    BodyPart,
    number
  >;
}

const firstBlock: BlockVolume = {
  block: { id: 'b1', number: 1, label: null },
  sets: setsOf({ chest: 12 }),
};

const deload: BlockVolume = {
  block: { id: 'b2', number: 2, label: 'Deload' },
  sets: setsOf({ chest: 4, triceps: 1.5, biceps: 1 }),
};

function rows(): string[] {
  return within(screen.getByRole('list', { name: 'Sets per body part' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

function chestClass(container: HTMLElement) {
  return container.querySelector('[data-muscle="chest"]')?.getAttribute('class');
}

describe('ProgramVolume', () => {
  it('starts on the current block', () => {
    render(
      <ProgramVolume volumes={[firstBlock, deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );

    expect(screen.getByRole('combobox', { name: 'Block' })).toHaveProperty('value', 'b2');
    expect(rows()[0]).toBe('Chest — 4 sets · Low');
    expect(screen.getByRole('img', { name: 'Weekly volume, Block 2 · Deload' })).toBeDefined();
  });

  it('switching block changes the list and the chart', () => {
    const { container } = render(
      <ProgramVolume volumes={[firstBlock, deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );
    const lowClass = chestClass(container);

    fireEvent.change(screen.getByRole('combobox', { name: 'Block' }), { target: { value: 'b1' } });

    expect(rows()[0]).toBe('Chest — 12 sets · On target');
    expect(screen.getByRole('img', { name: 'Weekly volume, Block 1' })).toBeDefined();
    expect(chestClass(container)).not.toBe(lowClass);
  });

  it('labels every level in the legend', () => {
    render(<ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />);

    const legend = screen
      .getAllByRole('list')
      .find((list) => list.getAttribute('aria-label') !== 'Sets per body part');
    expect(
      within(legend ?? document.body)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['None', 'Low', 'On target', 'High']);
  });

  it('shows half and single sets, sorted by sets, and every body part', () => {
    render(<ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />);

    const listed = rows();
    expect(listed.slice(0, 3)).toEqual([
      'Chest — 4 sets · Low',
      'Triceps — 1.5 sets · Low',
      'Biceps — 1 set · Low',
    ]);
    expect(listed).toHaveLength(bodyPartIds.length);
    expect(listed[3]).toBe('Name of upper-traps — 0 sets · None');
  });

  it('hides the block picker when there is one block', () => {
    render(<ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />);

    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('leaves a body part with no sets in the plain muscle colour', () => {
    const { container } = render(
      <ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );

    const classOf = (part: string) =>
      container.querySelector(`[data-muscle="${part}"]`)?.getAttribute('class');
    expect(classOf('lats')).toBe(classOf('quads'));
    expect(classOf('chest')).not.toBe(classOf('lats'));
  });
});
