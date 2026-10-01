import { describe, expect, test } from 'vitest';
import * as routeModule from './route';
import { POST } from './route';

describe('POST /api/auth/sign-out', () => {
  test('returns 204 and clears the session cookie', () => {
    const response = POST();

    expect(response.status).toBe(204);
    const sessionCookie = response.headers.getSetCookie().find((c) => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('Max-Age=0');
  });

  test('exports no GET handler', () => {
    expect('GET' in routeModule).toBe(false);
  });
});
