import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CodeExchangeParams, VerifiedIdentity } from '@/lib/server/google-oauth';
import { openSession } from '@/lib/server/session';

const exchangeCodeForIdToken = vi.fn<(params: CodeExchangeParams) => Promise<string>>();
const verifyIdToken = vi.fn<(idToken: string) => Promise<VerifiedIdentity>>();

vi.mock('@/lib/server/google-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/google-oauth')>();
  return {
    ...actual,
    exchangeCodeForIdToken: (params: CodeExchangeParams) => exchangeCodeForIdToken(params),
    verifyIdToken: (token: string) => verifyIdToken(token),
  };
});

const { GET } = await import('./route');

function requestFor(pathAndQuery: string, cookies: Record<string, string>): Request {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new Request(`http://localhost${pathAndQuery}`, { headers: { cookie: cookieHeader } });
}

beforeEach(() => {
  exchangeCodeForIdToken.mockReset();
  verifyIdToken.mockReset();
});

describe('GET /api/auth/google/callback', () => {
  test('redirects to /sign-in?error=denied when Google reports an error', async () => {
    const response = await GET(requestFor('/api/auth/google/callback?error=access_denied', {}));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/sign-in?error=denied');
    expect(response.headers.getSetCookie().some((c) => c.startsWith('session='))).toBe(false);
  });

  test('redirects to /sign-in?error=invalid_state when state does not match the cookie', async () => {
    const response = await GET(
      requestFor('/api/auth/google/callback?code=abc&state=mismatched', {
        oauth_state: 'expected-state',
        oauth_code_verifier: 'verifier',
      }),
    );

    expect(response.headers.get('location')).toBe('http://localhost/sign-in?error=invalid_state');
    expect(response.headers.getSetCookie().some((c) => c.startsWith('session='))).toBe(false);
  });

  test('redirects to /sign-in?error=forbidden for a non-allowlisted email, and sets no session', async () => {
    exchangeCodeForIdToken.mockResolvedValue('id-token');
    verifyIdToken.mockResolvedValue({ email: 'stranger@example.com', emailVerified: true });

    const response = await GET(
      requestFor('/api/auth/google/callback?code=abc&state=the-state', {
        oauth_state: 'the-state',
        oauth_code_verifier: 'verifier',
        oauth_next: '/fitness-tracker',
      }),
    );

    expect(response.headers.get('location')).toBe('http://localhost/sign-in?error=forbidden');
    expect(response.headers.getSetCookie().some((c) => c.startsWith('session='))).toBe(false);
  });

  test('on success, redirects to the stored next path and sets the session cookie', async () => {
    exchangeCodeForIdToken.mockResolvedValue('id-token');
    verifyIdToken.mockResolvedValue({ email: 'owner@example.com', emailVerified: true });

    const response = await GET(
      requestFor('/api/auth/google/callback?code=abc&state=the-state', {
        oauth_state: 'the-state',
        oauth_code_verifier: 'verifier',
        oauth_next: '/fitness-tracker',
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/fitness-tracker');

    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');

    const sealed = (sessionCookie ?? '').split(';')[0]?.split('=')[1];
    expect(sealed).toBeDefined();
    const payload = await openSession(sealed ?? '');
    expect(payload?.email).toBe('owner@example.com');
  });
});
