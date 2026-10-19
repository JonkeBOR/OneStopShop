import { describe, expect, it } from 'vitest';
import { bodyPartIds, bodyPartRoles, isBodyPart, isBodyPartRole } from './body-part';

describe('isBodyPart', () => {
  it('recognises every muscle on the anatomy chart', () => {
    expect(bodyPartIds).toEqual([
      'upper-traps',
      'lower-traps',
      'front-delts',
      'side-delts',
      'rear-delts',
      'chest',
      'biceps',
      'triceps',
      'forearms',
      'serratus',
      'abs',
      'obliques',
      'lats',
      'lower-back',
      'glutes',
      'quads',
      'adductors',
      'hamstrings',
      'calves',
      'tibialis',
    ]);
    for (const id of bodyPartIds) {
      expect(isBodyPart(id)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isBodyPart('neck')).toBe(false);
    expect(isBodyPart('traps')).toBe(false);
    expect(isBodyPart('upper-back')).toBe(false);
    expect(isBodyPart('Chest')).toBe(false);
    expect(isBodyPart(undefined)).toBe(false);
    expect(isBodyPart(5)).toBe(false);
  });
});

describe('isBodyPartRole', () => {
  it('recognises primary and secondary', () => {
    expect(bodyPartRoles).toEqual(['primary', 'secondary']);
    expect(isBodyPartRole('primary')).toBe(true);
    expect(isBodyPartRole('secondary')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isBodyPartRole('tertiary')).toBe(false);
    expect(isBodyPartRole('Primary')).toBe(false);
    expect(isBodyPartRole(undefined)).toBe(false);
    expect(isBodyPartRole(1)).toBe(false);
  });
});
