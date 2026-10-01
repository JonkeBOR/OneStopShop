import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildAuthorizationUrl,
  exchangeCodeForIdToken,
  generatePkcePair,
  generateState,
  verifyIdToken,
} from './google-oauth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAuthorizationUrl', () => {
  test('carries identity-only scopes and PKCE parameters, and omits refresh-token params', () => {
    const url = new URL(
      buildAuthorizationUrl({ state: 'the-state', codeChallenge: 'the-challenge' }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.searchParams.get('code_challenge')).toBe('the-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('access_type')).toBe(false);
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('generateState and generatePkcePair', () => {
  test('produce non-empty, distinct values on each call', () => {
    expect(generateState()).not.toBe(generateState());

    const first = generatePkcePair();
    const second = generatePkcePair();
    expect(first.verifier).not.toBe(second.verifier);
    expect(first.challenge).not.toBe(second.challenge);
    expect(first.verifier.length).toBeGreaterThan(20);
    expect(first.challenge.length).toBeGreaterThan(20);
  });
});

describe('exchangeCodeForIdToken', () => {
  test('parses the id_token out of the token response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response(JSON.stringify({ id_token: 'the-id-token' }), { status: 200 })),
    );

    const idToken = await exchangeCodeForIdToken({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(idToken).toBe('the-id-token');
  });

  test('throws when Google reports an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response('bad request', { status: 400 })),
    );

    await expect(
      exchangeCodeForIdToken({ code: 'auth-code', codeVerifier: 'verifier' }),
    ).rejects.toThrow();
  });
});

describe('verifyIdToken', () => {
  async function signGoogleToken(claims: Record<string, unknown>): Promise<string> {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const kid = crypto.randomUUID();
    const jwk = await exportJWK(publicKey);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
            status: 200,
          }),
        ),
      ),
    );

    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
  }

  test('verifies a well-formed token and returns the verified identity', async () => {
    const token = await signGoogleToken({
      iss: 'https://accounts.google.com',
      aud: 'test-google-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'owner@example.com',
      email_verified: true,
    });

    const identity = await verifyIdToken(token);

    expect(identity).toEqual({ email: 'owner@example.com', emailVerified: true });
  });

  test('rejects a wrong issuer', async () => {
    const token = await signGoogleToken({
      iss: 'https://not-google.example.com',
      aud: 'test-google-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'owner@example.com',
      email_verified: true,
    });

    await expect(verifyIdToken(token)).rejects.toThrow();
  });

  test('rejects a wrong audience', async () => {
    const token = await signGoogleToken({
      iss: 'https://accounts.google.com',
      aud: 'someone-elses-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'owner@example.com',
      email_verified: true,
    });

    await expect(verifyIdToken(token)).rejects.toThrow();
  });

  test('rejects an expired token', async () => {
    const token = await signGoogleToken({
      iss: 'https://accounts.google.com',
      aud: 'test-google-client-id',
      exp: Math.floor(Date.now() / 1000) - 3600,
      email: 'owner@example.com',
      email_verified: true,
    });

    await expect(verifyIdToken(token)).rejects.toThrow();
  });
});
