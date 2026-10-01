import 'server-only';
import { SignJWT, importPKCS8 } from 'jose';
import { StoreMisconfiguredError, StoreUnavailableError } from './collection';
import { env } from './env';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const ASSERTION_LIFETIME_SECONDS = 3600;
const EXPIRY_SKEW_SECONDS = 60;

type CachedToken = {
  readonly accessToken: string;
  readonly expiresAtEpochSeconds: number;
};

let cachedToken: CachedToken | null = null;

function isTokenResponse(value: unknown): value is { access_token: string; expires_in: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('access_token' in value) || !('expires_in' in value)) {
    return false;
  }
  return typeof value.access_token === 'string' && typeof value.expires_in === 'number';
}

async function mintAccessToken(): Promise<CachedToken> {
  const privateKey = await importPKCS8(env.googleServiceAccountPrivateKey, 'RS256');
  const nowSeconds = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({ scope: SHEETS_SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(env.googleServiceAccountEmail)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ASSERTION_LIFETIME_SECONDS)
    .sign(privateKey);

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
  } catch {
    throw new StoreUnavailableError('Could not reach Google to mint a store access token');
  }

  if (response.status === 429 || response.status >= 500) {
    throw new StoreUnavailableError('Google could not mint a store access token right now');
  }
  if (!response.ok) {
    throw new StoreMisconfiguredError('Google rejected the service account credentials');
  }

  const body: unknown = await response.json();
  if (!isTokenResponse(body)) {
    throw new StoreMisconfiguredError('Google token endpoint returned an unexpected response');
  }

  return {
    accessToken: body.access_token,
    expiresAtEpochSeconds: nowSeconds + body.expires_in,
  };
}

export async function getStoreAccessToken(): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtEpochSeconds - EXPIRY_SKEW_SECONDS > nowSeconds) {
    return cachedToken.accessToken;
  }
  cachedToken = await mintAccessToken();
  return cachedToken.accessToken;
}
