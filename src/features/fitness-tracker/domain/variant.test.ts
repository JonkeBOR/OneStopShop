import { describe, expect, it } from 'vitest';
import { fail, succeed } from './result';
import { decideVariantRemoval, decideVariantSwitch, fallbackVariantId } from './variant';

const base = {
  sessionStatus: 'in_progress' as const,
  loggedSetsInSlot: 0,
  currentVariantId: 'a' as string | null,
  targetVariantId: 'b',
  activeVariantIds: ['a', 'b'],
};

describe('decideVariantSwitch', () => {
  it('refuses a switch outside an in-progress session', () => {
    expect(decideVariantSwitch({ ...base, sessionStatus: 'finished' })).toEqual(
      fail('session-not-in-progress'),
    );
  });

  it('refuses a variant that is not active on the exercise', () => {
    expect(decideVariantSwitch({ ...base, targetVariantId: 'x' })).toEqual(fail('not-found'));
  });

  it('changes nothing when the current variant is chosen, even when locked', () => {
    expect(decideVariantSwitch({ ...base, loggedSetsInSlot: 2, targetVariantId: 'a' })).toEqual(
      succeed({ kind: 'unchanged' }),
    );
  });

  it('locks once a set of the slot is logged', () => {
    expect(decideVariantSwitch({ ...base, loggedSetsInSlot: 1 })).toEqual(fail('variant-locked'));
  });

  it('switches otherwise', () => {
    expect(decideVariantSwitch(base)).toEqual(succeed({ kind: 'switch' }));
  });
});

describe('fallbackVariantId', () => {
  it('falls back to the oldest remaining variant', () => {
    expect(fallbackVariantId(['a', 'b', 'c'], 'a')).toBe('b');
  });

  it('has no fallback when the last variant goes', () => {
    expect(fallbackVariantId(['a'], 'a')).toBeNull();
  });
});

describe('decideVariantRemoval', () => {
  it('refuses to remove the only active variant', () => {
    expect(
      decideVariantRemoval({ activeVariantIds: ['a'], variantId: 'a', hasSetLogs: false }),
    ).toEqual(fail('last-variant'));
  });

  it('retires a variant with logged sets and deletes one without', () => {
    const input = { activeVariantIds: ['a', 'b'], variantId: 'a' };
    expect(decideVariantRemoval({ ...input, hasSetLogs: true })).toEqual(succeed('retire'));
    expect(decideVariantRemoval({ ...input, hasSetLogs: false })).toEqual(succeed('delete'));
  });
});
