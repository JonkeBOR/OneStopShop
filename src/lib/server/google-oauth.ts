import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';
import { parseCookie, serializeCookie } from './http-cookies';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUER = 'https://accounts.google.com';

export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
export const OAUTH_CODE_VERIFIER_COOKIE_NAME = 'oauth_code_verifier';
export const OAUTH_NEXT_COOKIE_NAME = 'oauth_next';
const OAUTH_TRANSIENT_COOKIE_MAX_AGE_SECONDS = 600;

export function buildOAuthTransientCookieHeader(name: string, value: string): string {
  return serializeCookie(name, value, { maxAgeSeconds: OAUTH_TRANSIENT_COOKIE_MAX_AGE_SECONDS });
}

export function buildOAuthTransientClearCookieHeader(name: string): string {
  return serializeCookie(name, '', { maxAgeSeconds: 0 });
}

export function readOAuthCookie(cookieHeader: string | null, name: string): string | undefined {
  return parseCookie(cookieHeader, name);
}

export function isRelativeNextPath(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export type PkcePair = {
  readonly verifier: string;
  readonly challenge: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

export function generatePkcePair(): PkcePair {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export type AuthorizationUrlParams = {
  readonly state: string;
  readonly codeChallenge: string;
};

export function buildAuthorizationUrl({ state, codeChallenge }: AuthorizationUrlParams): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', env.googleClientId);
  url.searchParams.set('redirect_uri', env.googleOAuthRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export type CodeExchangeParams = {
  readonly code: string;
  readonly codeVerifier: string;
};

function isTokenResponse(value: unknown): value is { id_token: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('id_token' in value)) {
    return false;
  }
  return typeof value.id_token === 'string';
}

export async function exchangeCodeForIdToken({
  code,
  codeVerifier,
}: CodeExchangeParams): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleOAuthRedirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error('Google token exchange failed');
  }

  const body: unknown = await response.json();
  if (!isTokenResponse(body)) {
    throw new Error('Google token exchange returned an unexpected response');
  }
  return body.id_token;
}

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

export type VerifiedIdentity = {
  readonly email: string;
  readonly emailVerified: boolean;
};

function isIdTokenClaims(value: unknown): value is { email: string; email_verified: boolean } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('email' in value) || !('email_verified' in value)) {
    return false;
  }
  return typeof value.email === 'string' && typeof value.email_verified === 'boolean';
}

export async function verifyIdToken(idToken: string): Promise<VerifiedIdentity> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUER,
    audience: env.googleClientId,
  });

  if (!isIdTokenClaims(payload)) {
    throw new Error('Google ID token is missing required claims');
  }

  return { email: payload.email, emailVerified: payload.email_verified };
}
