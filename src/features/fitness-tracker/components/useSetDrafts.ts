'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type SetDraft = { weight?: string; reps?: string };
export type SetDrafts = Record<string, SetDraft>;

const keyPrefix = 'fitness:session:';
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function storageKey(sessionId: string): string {
  return `${keyPrefix}${sessionId}`;
}

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorage(key: string, raw: string): void {
  try {
    if (raw === '') {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, raw);
    }
  } catch {
    return;
  }
}

function snapshotOf(key: string): string {
  const cached = memory.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const raw = readStorage(key);
  memory.set(key, raw);
  return raw;
}

function publish(key: string, raw: string): void {
  memory.set(key, raw);
  writeStorage(key, raw);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isDraft(value: unknown): value is SetDraft {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDrafts(raw: string): SetDrafts {
  if (raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) {
      return {};
    }
    const drafts: SetDrafts = {};
    for (const [plannedSetId, draft] of Object.entries(parsed)) {
      if (isDraft(draft)) {
        drafts[plannedSetId] = draft;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

function serialize(drafts: SetDrafts): string {
  return Object.keys(drafts).length === 0 ? '' : JSON.stringify(drafts);
}

export function useSetDrafts(sessionId: string) {
  const key = storageKey(sessionId);
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshotOf(key),
    () => '',
  );
  const drafts = useMemo(() => parseDrafts(raw), [raw]);

  const setDraft = useCallback(
    (plannedSetId: string, patch: SetDraft) => {
      const current = parseDrafts(snapshotOf(key));
      publish(
        key,
        serialize({ ...current, [plannedSetId]: { ...current[plannedSetId], ...patch } }),
      );
    },
    [key],
  );

  const clearDraft = useCallback(
    (plannedSetId: string) => {
      const remaining = Object.fromEntries(
        Object.entries(parseDrafts(snapshotOf(key))).filter(([id]) => id !== plannedSetId),
      );
      publish(key, serialize(remaining));
    },
    [key],
  );

  const clearWeightDrafts = useCallback(
    (plannedSetIds: readonly string[]) => {
      const remaining: SetDrafts = {};
      for (const [id, draft] of Object.entries(parseDrafts(snapshotOf(key)))) {
        if (!plannedSetIds.includes(id)) {
          remaining[id] = draft;
          continue;
        }
        if (draft.reps !== undefined) {
          remaining[id] = { reps: draft.reps };
        }
      }
      publish(key, serialize(remaining));
    },
    [key],
  );

  const clearAll = useCallback(() => {
    publish(key, '');
  }, [key]);

  return { drafts, setDraft, clearDraft, clearWeightDrafts, clearAll };
}
