import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitnessErrorStrings } from '@/lib/strings/fitness';
import { useFitnessAction } from './useFitnessAction';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('useFitnessAction', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    router.refresh.mockReset();
    router.push.mockReset();
  });

  it('sends the method, address and JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x' }));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('POST', '/api/fitness/exercises', { name: 'Squat' });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/fitness/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Squat' }),
    });
  });

  it('sends no body when none is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('DELETE', '/api/fitness/slots/s1');
    });

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('hands the parsed body to onSuccess instead of refreshing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'new' }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useFitnessAction());

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.run('POST', '/api/x', {}, onSuccess);
    });

    expect(succeeded).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'new' });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('refreshes the page after a success with no onSuccess', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('PATCH', '/api/x', {});
    });

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.errorMessage).toBeNull();
  });

  it('SC-006: shows the text for a known refusal code and does not refresh', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'name-taken' }, 409));
    const { result } = renderHook(() => useFitnessAction());

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.run('POST', '/api/x', {});
    });

    expect(succeeded).toBe(false);
    expect(result.current.errorMessage).toBe(fitnessErrorStrings['name-taken']);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(['set-already-logged', 'session-not-in-progress', 'last-variant'] as const)(
    'edge case: %s shows its message and refreshes the stale page',
    async (code) => {
      fetchMock.mockResolvedValue(jsonResponse({ error: code }, 409));
      const { result } = renderHook(() => useFitnessAction());

      await act(async () => {
        await result.current.run('POST', '/api/x', {});
      });

      expect(result.current.errorMessage).toBe(fitnessErrorStrings[code]);
      expect(router.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('SC-006: shows the generic text for a body that is not a known code', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 502 }));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('POST', '/api/x', {});
    });

    expect(result.current.errorMessage).toBe(fitnessErrorStrings.unexpected);
  });

  it('SC-006: shows the generic text when the request itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('POST', '/api/x', {});
    });

    expect(result.current.errorMessage).toBe(fitnessErrorStrings.unexpected);
    expect(result.current.pending).toBe(false);
  });

  it('is pending while a request is in flight and ignores a second request', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useFitnessAction());

    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.run('POST', '/api/x', {});
    });
    expect(result.current.pending).toBe(true);

    let second = true;
    await act(async () => {
      second = await result.current.run('POST', '/api/x', {});
    });
    expect(second).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(jsonResponse({}));
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it('clears the message on request and on demand', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'name-taken' }, 409));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const { result } = renderHook(() => useFitnessAction());

    await act(async () => {
      await result.current.run('POST', '/api/x', {});
    });
    expect(result.current.errorMessage).not.toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.errorMessage).toBeNull();

    await act(async () => {
      await result.current.run('POST', '/api/x', {});
    });
    expect(result.current.errorMessage).toBeNull();
  });
});
