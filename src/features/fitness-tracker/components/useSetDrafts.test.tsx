import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadHook() {
  vi.resetModules();
  const loaded = await import('./useSetDrafts');
  return loaded.useSetDrafts;
}

describe('useSetDrafts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('FR-021: starts with no drafts', async () => {
    const useSetDrafts = await loadHook();

    const { result } = renderHook(() => useSetDrafts('session-1'));

    expect(result.current.drafts).toEqual({});
  });

  it('FR-021: keeps what was typed for a planned set', async () => {
    const useSetDrafts = await loadHook();
    const { result } = renderHook(() => useSetDrafts('session-1'));

    act(() => {
      result.current.setDraft('p1', { weight: '67,5' });
    });
    act(() => {
      result.current.setDraft('p1', { reps: '8' });
    });

    expect(result.current.drafts).toEqual({ p1: { weight: '67,5', reps: '8' } });
  });

  it('FR-021: a later instance for the same session sees the drafts', async () => {
    const useSetDrafts = await loadHook();
    const first = renderHook(() => useSetDrafts('session-1'));
    act(() => {
      first.result.current.setDraft('p1', { weight: '70' });
    });
    first.unmount();

    const second = renderHook(() => useSetDrafts('session-1'));

    expect(second.result.current.drafts).toEqual({ p1: { weight: '70' } });
  });

  it('FR-021: drafts survive a page reload, because they are in the browser storage', async () => {
    const before = await loadHook();
    const first = renderHook(() => before('session-1'));
    act(() => {
      first.result.current.setDraft('p2', { reps: '9' });
    });
    first.unmount();

    const after = await loadHook();
    const reloaded = renderHook(() => after('session-1'));

    expect(reloaded.result.current.drafts).toEqual({ p2: { reps: '9' } });
  });

  it('keeps drafts of different sessions apart', async () => {
    const useSetDrafts = await loadHook();
    const one = renderHook(() => useSetDrafts('session-1'));
    const two = renderHook(() => useSetDrafts('session-2'));

    act(() => {
      one.result.current.setDraft('p1', { weight: '50' });
    });

    expect(two.result.current.drafts).toEqual({});
  });

  it('clears the draft of one planned set once it is logged', async () => {
    const useSetDrafts = await loadHook();
    const { result } = renderHook(() => useSetDrafts('session-1'));
    act(() => {
      result.current.setDraft('p1', { weight: '50' });
      result.current.setDraft('p2', { weight: '55' });
    });

    act(() => {
      result.current.clearDraft('p1');
    });

    expect(result.current.drafts).toEqual({ p2: { weight: '55' } });
  });

  it('clears the weights of the given planned sets and keeps their reps and the other drafts', async () => {
    const useSetDrafts = await loadHook();
    const { result } = renderHook(() => useSetDrafts('session-1'));
    act(() => {
      result.current.setDraft('p1', { weight: '50', reps: '8' });
      result.current.setDraft('p2', { weight: '55' });
      result.current.setDraft('p3', { weight: '60' });
    });

    act(() => {
      result.current.clearWeightDrafts(['p1', 'p2']);
    });

    expect(result.current.drafts).toEqual({ p1: { reps: '8' }, p3: { weight: '60' } });
  });

  it('clears every draft of the session, and the browser storage, when the workout is finished', async () => {
    const useSetDrafts = await loadHook();
    const { result } = renderHook(() => useSetDrafts('session-1'));
    act(() => {
      result.current.setDraft('p1', { weight: '50' });
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.drafts).toEqual({});
    expect(window.localStorage.getItem('fitness:session:session-1')).toBeNull();
  });

  it('R12: still works when the browser storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const useSetDrafts = await loadHook();
    const { result } = renderHook(() => useSetDrafts('session-1'));

    act(() => {
      result.current.setDraft('p1', { weight: '60' });
    });

    expect(result.current.drafts).toEqual({ p1: { weight: '60' } });
    act(() => {
      result.current.clearAll();
    });
    expect(result.current.drafts).toEqual({});
  });

  it('ignores stored data that is not a map of drafts', async () => {
    window.localStorage.setItem('fitness:session:session-1', '[1,2,3]');
    const useSetDrafts = await loadHook();

    const { result } = renderHook(() => useSetDrafts('session-1'));

    expect(result.current.drafts).toEqual({});
  });
});
