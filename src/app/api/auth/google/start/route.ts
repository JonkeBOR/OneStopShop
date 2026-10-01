import {
  OAUTH_CODE_VERIFIER_COOKIE_NAME,
  OAUTH_NEXT_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  buildAuthorizationUrl,
  buildOAuthTransientCookieHeader,
  generatePkcePair,
  generateState,
  isRelativeNextPath,
} from '@/lib/server/google-oauth';

export function GET(request: Request): Response {
  const requestedNext = new URL(request.url).searchParams.get('next');
  const next = isRelativeNextPath(requestedNext) ? requestedNext : '/';

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();

  const headers = new Headers({
    Location: buildAuthorizationUrl({ state, codeChallenge: challenge }),
  });
  headers.append('Set-Cookie', buildOAuthTransientCookieHeader(OAUTH_STATE_COOKIE_NAME, state));
  headers.append(
    'Set-Cookie',
    buildOAuthTransientCookieHeader(OAUTH_CODE_VERIFIER_COOKIE_NAME, verifier),
  );
  headers.append('Set-Cookie', buildOAuthTransientCookieHeader(OAUTH_NEXT_COOKIE_NAME, next));

  return new Response(null, { status: 302, headers });
}
