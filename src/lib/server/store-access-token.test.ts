import { decodeJwt } from 'jose';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function loadStoreModules() {
  const [storeAccessToken, collection] = await Promise.all([
    import('./store-access-token'),
    import('./collection'),
  ]);
  return { ...storeAccessToken, ...collection };
}

describe('getStoreAccessToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('signs an assertion carrying iss, aud, the spreadsheets scope and an exp at most one hour ahead', async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getStoreAccessToken } = await import('./store-access-token');
    await getStoreAccessToken();

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    const body = init?.body;
    expect(typeof body).toBe('string');
    const params = new URLSearchParams(typeof body === 'string' ? body : '');
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const assertion = params.get('assertion') ?? '';
    const claims = decodeJwt(assertion);
    expect(claims['iss']).toBe('test-service-account@test-project.iam.gserviceaccount.com');
    expect(claims['aud']).toBe('https://oauth2.googleapis.com/token');
    expect(claims['scope']).toBe('https://www.googleapis.com/auth/spreadsheets');

    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeDefined();
    expect(claims.exp ?? 0).toBeLessThanOrEqual(nowSeconds + 3600);
  });

  test('reuses a cached token within its lifetime', async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'token-1', expires_in: 3600 }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getStoreAccessToken } = await import('./store-access-token');
    const first = await getStoreAccessToken();
    const second = await getStoreAccessToken();

    expect(first).toBe('token-1');
    expect(second).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('re-mints a token within 60 seconds of expiry', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-1', expires_in: 30 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token-2', expires_in: 3600 }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { getStoreAccessToken } = await import('./store-access-token');
    const first = await getStoreAccessToken();
    const second = await getStoreAccessToken();

    expect(first).toBe('token-1');
    expect(second).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('maps Google rejecting the service account credentials to StoreMisconfiguredError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchLike>(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
      ),
    );

    const { getStoreAccessToken, StoreMisconfiguredError } = await loadStoreModules();

    await expect(getStoreAccessToken()).rejects.toBeInstanceOf(StoreMisconfiguredError);
  });

  test('maps a 401 from the token endpoint to StoreMisconfiguredError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchLike>(() => Promise.resolve(new Response('unauthorized', { status: 401 }))),
    );

    const { getStoreAccessToken, StoreMisconfiguredError } = await loadStoreModules();

    await expect(getStoreAccessToken()).rejects.toBeInstanceOf(StoreMisconfiguredError);
  });

  test('maps a 503 from the token endpoint to StoreUnavailableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchLike>(() => Promise.resolve(new Response('unavailable', { status: 503 }))),
    );

    const { getStoreAccessToken, StoreUnavailableError } = await loadStoreModules();

    await expect(getStoreAccessToken()).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  test('maps a network failure to StoreUnavailableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchLike>(() => Promise.reject(new Error('network down'))),
    );

    const { getStoreAccessToken, StoreUnavailableError } = await loadStoreModules();

    await expect(getStoreAccessToken()).rejects.toBeInstanceOf(StoreUnavailableError);
  });
});
