import { beforeEach, describe, expect, test, vi } from 'vitest';
import { StoreMisconfiguredError, StoreUnavailableError } from '@/lib/server/collection';
import { SESSION_COOKIE_NAME, sealSession } from '@/lib/server/session';
import { fitnessTrackerStrings } from '@/lib/strings/fitness-tracker';
import type { BodyweightMeasurement } from '@/features/fitness-tracker/bodyweight';

const listBodyweightMeasurements = vi.fn<() => Promise<readonly BodyweightMeasurement[]>>();
const appendBodyweightMeasurement =
  vi.fn<(input: { kilograms: number; recordedOn: string }) => Promise<BodyweightMeasurement>>();

vi.mock('@/features/fitness-tracker/bodyweight-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/fitness-tracker/bodyweight-store')>();
  return {
    ...actual,
    listBodyweightMeasurements: () => listBodyweightMeasurements(),
    appendBodyweightMeasurement: (input: { kilograms: number; recordedOn: string }) =>
      appendBodyweightMeasurement(input),
  };
});

const { GET, POST } = await import('./route');

async function ownerCookieHeader(): Promise<string> {
  const sealed = await sealSession({ email: 'owner@example.com', issuedAt: Date.now() });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

async function strangerCookieHeader(): Promise<string> {
  const sealed = await sealSession({ email: 'stranger@example.com', issuedAt: Date.now() });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

function getRequest(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return new Request('http://localhost/api/bodyweight', { headers });
}

function postRequest(cookie: string | undefined, body: unknown): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return new Request('http://localhost/api/bodyweight', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  listBodyweightMeasurements.mockReset();
  appendBodyweightMeasurement.mockReset();
});

describe('GET /api/bodyweight', () => {
  test('returns 401 with no data when unauthenticated', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    expect(listBodyweightMeasurements).not.toHaveBeenCalled();
  });

  test('returns 403 for a non-allowlisted session', async () => {
    const response = await GET(getRequest(await strangerCookieHeader()));

    expect(response.status).toBe(403);
    expect(listBodyweightMeasurements).not.toHaveBeenCalled();
  });

  test('returns 200 with the measurements for the owner', async () => {
    listBodyweightMeasurements.mockResolvedValue([
      { id: '1', recordedOn: '2026-03-05', kilograms: 82.4, createdAt: '2026-03-05T06:00:00.000Z' },
    ]);

    const response = await GET(getRequest(await ownerCookieHeader()));

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual({
      measurements: [
        {
          id: '1',
          recordedOn: '2026-03-05',
          kilograms: 82.4,
          createdAt: '2026-03-05T06:00:00.000Z',
        },
      ],
    });
  });

  test('maps a store-unavailable failure to 502', async () => {
    listBodyweightMeasurements.mockRejectedValue(new StoreUnavailableError('unavailable'));

    const response = await GET(getRequest(await ownerCookieHeader()));

    expect(response.status).toBe(502);
    const json: unknown = await response.json();
    expect(json).toEqual({
      error: { code: 'STORE_UNAVAILABLE', message: fitnessTrackerStrings.errors.storeUnavailable },
    });
  });

  test('maps a store-misconfigured failure to 500', async () => {
    listBodyweightMeasurements.mockRejectedValue(new StoreMisconfiguredError('misconfigured'));

    const response = await GET(getRequest(await ownerCookieHeader()));

    expect(response.status).toBe(500);
    const json: unknown = await response.json();
    expect(json).toEqual({
      error: {
        code: 'STORE_MISCONFIGURED',
        message: fitnessTrackerStrings.errors.storeMisconfigured,
      },
    });
  });
});

describe('POST /api/bodyweight', () => {
  test('returns 401 with no data when unauthenticated', async () => {
    const response = await POST(postRequest(undefined, { kilograms: 82.4 }));

    expect(response.status).toBe(401);
    expect(appendBodyweightMeasurement).not.toHaveBeenCalled();
  });

  test('returns 403 for a non-allowlisted session', async () => {
    const response = await POST(postRequest(await strangerCookieHeader(), { kilograms: 82.4 }));

    expect(response.status).toBe(403);
    expect(appendBodyweightMeasurement).not.toHaveBeenCalled();
  });

  test.each([
    ['a missing weight', {}],
    ['a non-numeric weight', { kilograms: 'eighty' }],
    ['a weight of 5', { kilograms: 5 }],
    ['a weight of 500', { kilograms: 500 }],
    ['a malformed date', { kilograms: 80, recordedOn: 'not-a-date' }],
    ['a date one day in the future', { kilograms: 80, recordedOn: '2999-01-01' }],
  ])('returns 400 for %s, without calling the store', async (_description, body) => {
    const response = await POST(postRequest(await ownerCookieHeader(), body));

    expect(response.status).toBe(400);
    const json: unknown = await response.json();
    expect(json).toMatchObject({ error: { code: 'INVALID_MEASUREMENT' } });
    expect(appendBodyweightMeasurement).not.toHaveBeenCalled();
  });

  test('returns 201 and appends exactly once for a valid body', async () => {
    const created: BodyweightMeasurement = {
      id: 'new-id',
      recordedOn: '2026-03-05',
      kilograms: 82.4,
      createdAt: '2026-03-05T06:00:00.000Z',
    };
    appendBodyweightMeasurement.mockResolvedValue(created);

    const response = await POST(
      postRequest(await ownerCookieHeader(), { kilograms: 82.4, recordedOn: '2026-03-05' }),
    );

    expect(response.status).toBe(201);
    const json: unknown = await response.json();
    expect(json).toEqual({ measurement: created });
    expect(appendBodyweightMeasurement).toHaveBeenCalledTimes(1);
    expect(appendBodyweightMeasurement).toHaveBeenCalledWith({
      kilograms: 82.4,
      recordedOn: '2026-03-05',
    });
  });

  test('with no recordedOn, stores today in the configured timezone', async () => {
    appendBodyweightMeasurement.mockResolvedValue({
      id: 'new-id',
      recordedOn: 'irrelevant',
      kilograms: 82.4,
      createdAt: 'irrelevant',
    });

    await POST(postRequest(await ownerCookieHeader(), { kilograms: 82.4 }));

    const call = appendBodyweightMeasurement.mock.calls[0];
    expect(call?.[0]?.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('maps a store-unavailable failure to 502', async () => {
    appendBodyweightMeasurement.mockRejectedValue(new StoreUnavailableError('unavailable'));

    const response = await POST(postRequest(await ownerCookieHeader(), { kilograms: 82.4 }));

    expect(response.status).toBe(502);
  });

  test('maps a store-misconfigured failure to 500', async () => {
    appendBodyweightMeasurement.mockRejectedValue(new StoreMisconfiguredError('misconfigured'));

    const response = await POST(postRequest(await ownerCookieHeader(), { kilograms: 82.4 }));

    expect(response.status).toBe(500);
  });

  test('no error response body contains a token, spreadsheet id, or provider text', async () => {
    appendBodyweightMeasurement.mockRejectedValue(
      new StoreMisconfiguredError('403 from sheets.googleapis.com with token ya29.secret'),
    );

    const response = await POST(postRequest(await ownerCookieHeader(), { kilograms: 82.4 }));
    const text = await response.text();

    expect(text).not.toContain('ya29.');
    expect(text).not.toContain('sheets.googleapis.com');
    expect(text).not.toContain('test-sheet-id');
  });
});
