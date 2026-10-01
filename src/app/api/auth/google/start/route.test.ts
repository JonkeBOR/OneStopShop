import { describe, expect, test } from 'vitest';
import {
  OAUTH_CODE_VERIFIER_COOKIE_NAME,
  OAUTH_NEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
} from '@/lib/server/google-oauth';
import { GET } from './route';

function requestFor(pathAndQuery: string): Request {
  return new Request(`http://localhost${pathAndQuery}`);
}

describe('GET /api/auth/google/start', () => {
  test('redirects to Google with state and PKCE cookies set as HttpOnly', () => {
    const response = GET(requestFor('/api/auth/google/start'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );

    const setCookies = response.headers.getSetCookie();
    const stateCookie = setCookies.find((cookie) =>
      cookie.startsWith(`${OAUTH_STATE_COOKIE_NAME}=`),
    );
    const verifierCookie = setCookies.find((cookie) =>
      cookie.startsWith(`${OAUTH_CODE_VERIFIER_COOKIE_NAME}=`),
    );

    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain('HttpOnly');
    expect(verifierCookie).toBeDefined();
    expect(verifierCookie).toContain('HttpOnly');
  });

  test('stores a valid relative next path for the callback to return to', () => {
    const response = GET(requestFor('/api/auth/google/start?next=%2Ffitness-tracker'));

    const setCookies = response.headers.getSetCookie();
    const nextCookie = setCookies.find((cookie) => cookie.startsWith(`${OAUTH_NEXT_COOKIE_NAME}=`));

    expect(nextCookie).toContain(`${OAUTH_NEXT_COOKIE_NAME}=/fitness-tracker`);
  });

  test('rejects a next parameter that is not a relative path beginning with /', () => {
    const response = GET(requestFor('/api/auth/google/start?next=https%3A%2F%2Fevil.example.com'));

    const setCookies = response.headers.getSetCookie();
    const nextCookie = setCookies.find((cookie) => cookie.startsWith(`${OAUTH_NEXT_COOKIE_NAME}=`));

    expect(nextCookie).toContain(`${OAUTH_NEXT_COOKIE_NAME}=/`);
    expect(nextCookie).not.toContain('evil.example.com');
  });
});
