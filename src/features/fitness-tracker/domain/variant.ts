import { fail, type Result, succeed } from './result';
import type { SessionStatus } from './types';

export const defaultVariantName = 'Default';

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

export function decideVariantRemoval(input: {
  activeVariantIds: readonly string[];
  variantId: string;
  hasSetLogs: boolean;
}): Result<'retire' | 'delete', 'last-variant'> {
  if (fallbackVariantId(input.activeVariantIds, input.variantId) === null) {
    return fail('last-variant');
  }
  return succeed(input.hasSetLogs ? 'retire' : 'delete');
}
