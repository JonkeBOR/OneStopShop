import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type BodyPart, bodyPartIds } from '../domain/body-part';
import type { BodyPartView } from '../domain/types';
import { type BlockVolume, ProgramVolume } from './ProgramVolume';

const bodyParts: BodyPartView[] = bodyPartIds.map((id) => ({ id, name: `Name of ${id}` }));

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
  sets: setsOf({ chest: 4, triceps: 1.5, lats: 24 }),
};

function highlightOf(container: HTMLElement, part: BodyPart) {
  return container.querySelector(`[data-muscle="${part}"]`)?.getAttribute('data-highlight') ?? null;
}

describe('ProgramVolume', () => {
  it('starts on the current block', () => {
    const { container } = render(
      <ProgramVolume volumes={[firstBlock, deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );

    expect(screen.getByRole('combobox', { name: 'Block' })).toHaveProperty('value', 'b2');
    expect(screen.getByRole('img', { name: 'Weekly volume, Block 2 · Deload' })).toBeDefined();
    expect(highlightOf(container, 'chest')).toBe('low');
  });

  it('switching block recolours the chart', () => {
    const { container } = render(
      <ProgramVolume volumes={[firstBlock, deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Block' }), { target: { value: 'b1' } });

    expect(screen.getByRole('img', { name: 'Weekly volume, Block 1' })).toBeDefined();
    expect(highlightOf(container, 'chest')).toBe('target');
    expect(highlightOf(container, 'lats')).toBeNull();
  });

  it('colours each body part by its level and leaves those with no sets plain', () => {
    const { container } = render(
      <ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />,
    );

    expect(highlightOf(container, 'chest')).toBe('low');
    expect(highlightOf(container, 'triceps')).toBe('low');
    expect(highlightOf(container, 'lats')).toBe('high');
    expect(highlightOf(container, 'quads')).toBeNull();
  });

  it('labels every level in the legend and lists nothing else', () => {
    render(<ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />);

    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['None', 'Low', 'On target', 'High']);
  });

  it('hides the block picker when there is one block', () => {
    render(<ProgramVolume volumes={[deload]} bodyParts={bodyParts} currentBlockId="b2" />);

    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
