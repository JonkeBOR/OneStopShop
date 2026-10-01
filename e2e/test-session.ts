import { EncryptJWT } from 'jose';

const SESSION_SECRET = process.env['SESSION_SECRET'] ?? '';
export const ALLOWED_GOOGLE_EMAIL = process.env['ALLOWED_GOOGLE_EMAIL'] ?? '';

export async function sealTestSession(email: string = ALLOWED_GOOGLE_EMAIL): Promise<string> {
  const key = new Uint8Array(Buffer.from(SESSION_SECRET, 'base64'));
  return new EncryptJWT({ email, issuedAt: Date.now() })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(key);
}

export function sessionCookie(sealed: string) {
  return {
    name: 'session',
    value: sealed,
    url: 'http://localhost:3000',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  };
}
