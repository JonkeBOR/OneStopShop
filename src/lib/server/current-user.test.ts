import { describe, expect, test } from 'vitest';
import {
  ForbiddenAccessError,
  UnauthenticatedError,
  requireOwnerFromRequest,
} from './current-user';
import { SESSION_COOKIE_NAME, sealSession } from './session';

function requestWithSession(sealed: string | undefined): Request {
  const headers = new Headers();
  if (sealed !== undefined) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${sealed}`);
  }
  return new Request('http://localhost/api/bodyweight', { headers });
}

describe('requireOwnerFromRequest', () => {
  test('throws UnauthenticatedError when there is no session cookie', async () => {
    await expect(requireOwnerFromRequest(requestWithSession(undefined))).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  test('throws UnauthenticatedError when the session cookie cannot be opened', async () => {
    await expect(requireOwnerFromRequest(requestWithSession('not-a-valid-jwe'))).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  test('resolves the email for the allowlisted owner after trimming and case-folding', async () => {
    const sealed = await sealSession({ email: ' Owner@Example.com ', issuedAt: Date.now() });

    await expect(requireOwnerFromRequest(requestWithSession(sealed))).resolves.toBe(
      ' Owner@Example.com ',
    );
  });

  test('throws ForbiddenAccessError for a session belonging to a non-allowlisted email', async () => {
    const sealed = await sealSession({ email: 'someone-else@example.com', issuedAt: Date.now() });

    await expect(requireOwnerFromRequest(requestWithSession(sealed))).rejects.toThrow(
      ForbiddenAccessError,
    );
  });
});
