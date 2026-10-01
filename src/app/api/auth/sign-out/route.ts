import { buildSessionClearCookieHeader } from '@/lib/server/session';

export function POST(): Response {
  const headers = new Headers();
  headers.append('Set-Cookie', buildSessionClearCookieHeader());
  return new Response(null, { status: 204, headers });
}
