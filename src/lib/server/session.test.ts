import { EncryptJWT } from 'jose';
import { describe, expect, test } from 'vitest';
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  buildSessionClearCookieHeader,
  buildSessionCookieHeader,
  openSession,
  readSessionCookieFromHeader,
  sealSession,
} from './session';

describe('sealSession and openSession', () => {
  test('round-trips a payload', async () => {
    const payload = { email: 'owner@example.com', issuedAt: 1_700_000_000_000 };

    const sealed = await sealSession(payload);
    const opened = await openSession(sealed);

    expect(opened).toEqual(payload);
  });

  test('fails to open a tampered ciphertext', async () => {
    const sealed = await sealSession({ email: 'owner@example.com', issuedAt: 1 });
    const tampered = `${sealed.slice(0, -4)}abcd`;

    await expect(openSession(tampered)).resolves.toBeNull();
  });

  test('fails to open a payload sealed with a different key', async () => {
    const otherKey = new Uint8Array(32).fill(7);
    const sealedWithOtherKey = await new EncryptJWT({ email: 'owner@example.com', issuedAt: 1 })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(otherKey);

    await expect(openSession(sealedWithOtherKey)).resolves.toBeNull();
  });

  test('fails to open garbage input', async () => {
    await expect(openSession('not-a-jwe')).resolves.toBeNull();
  });
});

describe('buildSessionCookieHeader', () => {
  test('carries HttpOnly, Secure, SameSite=Lax, Path=/ and the 30-day Max-Age', () => {
    const header = buildSessionCookieHeader('sealed-value');

    expect(header).toContain(`${SESSION_COOKIE_NAME}=sealed-value`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`);
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBe(2_592_000);
  });
});

describe('buildSessionClearCookieHeader', () => {
  test('clears the cookie with Max-Age=0', () => {
    const header = buildSessionClearCookieHeader();

    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toContain('Max-Age=0');
  });
});

describe('readSessionCookieFromHeader', () => {
  test('returns undefined when there is no cookie header', () => {
    expect(readSessionCookieFromHeader(null)).toBeUndefined();
  });

  test('returns undefined when the session cookie is absent', () => {
    expect(readSessionCookieFromHeader('other=value')).toBeUndefined();
  });

  test('extracts the session cookie value among several cookies', () => {
    const header = `foo=bar; ${SESSION_COOKIE_NAME}=sealed-value; other=1`;

    expect(readSessionCookieFromHeader(header)).toBe('sealed-value');
  });
});
