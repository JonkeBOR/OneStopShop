import 'server-only';
import { cookies } from 'next/headers';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { env } from './env';
import { parseCookie, serializeCookie } from './http-cookies';

export type SessionPayload = {
  readonly email: string;
  readonly issuedAt: number;
};

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sessionKey(): Uint8Array {
  return new Uint8Array(Buffer.from(env.sessionSecret, 'base64'));
}

export async function sealSession(payload: SessionPayload): Promise<string> {
  return new EncryptJWT({ email: payload.email, issuedAt: payload.issuedAt })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(sessionKey());
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('email' in value) || !('issuedAt' in value)) {
    return false;
  }
  return typeof value.email === 'string' && typeof value.issuedAt === 'number';
}

export async function openSession(sealed: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(sealed, sessionKey());
    if (!isSessionPayload(payload)) {
      return null;
    }
    return { email: payload.email, issuedAt: payload.issuedAt };
  } catch {
    return null;
  }
}

export function buildSessionCookieHeader(sealed: string): string {
  return serializeCookie(SESSION_COOKIE_NAME, sealed, {
    maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function buildSessionClearCookieHeader(): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', { maxAgeSeconds: 0 });
}

export function readSessionCookieFromHeader(cookieHeader: string | null): string | undefined {
  return parseCookie(cookieHeader, SESSION_COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}
