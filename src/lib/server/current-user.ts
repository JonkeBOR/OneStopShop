import 'server-only';
import { cache } from 'react';
import { env } from './env';
import { openSession, readSessionCookie, readSessionCookieFromHeader } from './session';

export class UnauthenticatedError extends Error {}
export class ForbiddenAccessError extends Error {}

export function isAllowedOwnerEmail(email: string): boolean {
  return email.trim().toLowerCase() === env.allowedGoogleEmail.trim().toLowerCase();
}

export async function resolveOwnerEmail(sealedSession: string | undefined): Promise<string | null> {
  if (!sealedSession) {
    return null;
  }
  const payload = await openSession(sealedSession);
  return payload?.email ?? null;
}

function requireOwnerEmail(email: string | null): string {
  if (!email) {
    throw new UnauthenticatedError('No session');
  }
  if (!isAllowedOwnerEmail(email)) {
    throw new ForbiddenAccessError('This Google account is not allowed to use this app');
  }
  return email;
}

export const getCurrentUser = cache(async (): Promise<string | null> => {
  return resolveOwnerEmail(await readSessionCookie());
});

export async function requireOwner(): Promise<string> {
  return requireOwnerEmail(await getCurrentUser());
}

export async function requireOwnerFromRequest(request: Request): Promise<string> {
  const sealedSession = readSessionCookieFromHeader(request.headers.get('cookie'));
  return requireOwnerEmail(await resolveOwnerEmail(sealedSession));
}
