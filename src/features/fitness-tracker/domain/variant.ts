import { fail, type Result, succeed } from './result';
import type { SessionStatus } from './types';

export type ParkedWeight = { variantId: string; lastWeightGrams: number };

export type VariantSwitchDecision = { kind: 'switch' } | { kind: 'unchanged' };

export function decideVariantSwitch(input: {
  sessionStatus: SessionStatus;
  loggedSetsInSlot: number;
  currentVariantId: string | null;
  targetVariantId: string;
  activeVariantIds: readonly string[];
}): Result<VariantSwitchDecision, 'session-not-in-progress' | 'not-found' | 'variant-locked'> {
  if (input.sessionStatus !== 'in_progress') {
    return fail('session-not-in-progress');
  }
  if (!input.activeVariantIds.includes(input.targetVariantId)) {
    return fail('not-found');
  }
  if (input.targetVariantId === input.currentVariantId) {
    return succeed({ kind: 'unchanged' });
  }
  if (input.loggedSetsInSlot > 0) {
    return fail('variant-locked');
  }
  return succeed({ kind: 'switch' });
}

export function fallbackVariantId(
  activeIdsOldestFirst: readonly string[],
  removedId: string,
): string | null {
  return activeIdsOldestFirst.find((id) => id !== removedId) ?? null;
}

export function removalOf(hasSetLogs: boolean): 'retire' | 'delete' {
  return hasSetLogs ? 'retire' : 'delete';
}
