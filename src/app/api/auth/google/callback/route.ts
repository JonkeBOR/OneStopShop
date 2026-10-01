import { isAllowedOwnerEmail } from '@/lib/server/current-user';
import {
  OAUTH_CODE_VERIFIER_COOKIE_NAME,
  OAUTH_NEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  buildOAuthTransientClearCookieHeader,
  exchangeCodeForIdToken,
  isRelativeNextPath,
  readOAuthCookie,
  verifyIdToken,
} from '@/lib/server/google-oauth';
import { buildSessionCookieHeader, sealSession } from '@/lib/server/session';

function clearTransientCookies(headers: Headers): void {
  headers.append('Set-Cookie', buildOAuthTransientClearCookieHeader(OAUTH_STATE_COOKIE_NAME));
  headers.append(
    'Set-Cookie',
    buildOAuthTransientClearCookieHeader(OAUTH_CODE_VERIFIER_COOKIE_NAME),
  );
  headers.append('Set-Cookie', buildOAuthTransientClearCookieHeader(OAUTH_NEXT_COOKIE_NAME));
}

function signInRedirect(requestUrl: URL, errorCode: string): Response {
  const target = new URL('/sign-in', requestUrl);
  target.searchParams.set('error', errorCode);
  const headers = new Headers({ Location: target.toString() });
  clearTransientCookies(headers);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get('cookie');

  if (url.searchParams.get('error')) {
    return signInRedirect(url, 'denied');
  }

  const state = url.searchParams.get('state');
  const storedState = readOAuthCookie(cookieHeader, OAUTH_STATE_COOKIE_NAME);
  const code = url.searchParams.get('code');
  const codeVerifier = readOAuthCookie(cookieHeader, OAUTH_CODE_VERIFIER_COOKIE_NAME);

  if (!state || !storedState || state !== storedState || !code || !codeVerifier) {
    return signInRedirect(url, 'invalid_state');
  }

  const idToken = await exchangeCodeForIdToken({ code, codeVerifier });
  const { email } = await verifyIdToken(idToken);

  if (!isAllowedOwnerEmail(email)) {
    return signInRedirect(url, 'forbidden');
  }

  const storedNext = readOAuthCookie(cookieHeader, OAUTH_NEXT_COOKIE_NAME);
  const target = new URL(isRelativeNextPath(storedNext) ? storedNext : '/', url);

  const sealed = await sealSession({ email, issuedAt: Date.now() });

  const headers = new Headers({ Location: target.toString() });
  headers.append('Set-Cookie', buildSessionCookieHeader(sealed));
  clearTransientCookies(headers);

  return new Response(null, { status: 302, headers });
}
