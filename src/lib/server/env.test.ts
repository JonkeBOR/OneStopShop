import { describe, expect, test } from 'vitest';
import { parseEnv } from './env';

const validPrivateKeyWithLiteralNewlines = [
  '-----BEGIN PRIVATE KEY-----\\n',
  'MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAsvxbEyu1D0/tGhSD\\n',
  'jazEbgFghKvUWuFyPvv3xLBdvnnUCkxlKD5ZKD1oNyv0lICZ7X1HK1wZk8fN1zqO\\n',
  'OQIDAQABAkAAcqQOOSbdvbcAAY4hK3TgB4mkAAAAAAAAAAAAAAAAAAAAAAAAAAAA\\n',
  '-----END PRIVATE KEY-----\\n',
].join('');

function buildValidEnv(): Record<string, string> {
  return {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
    SESSION_SECRET: 'X+DpWZmHM4nF4gAZyPoskcUFw2GhYvt3fxLEgXf5sis=',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service-account@test-project.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: validPrivateKeyWithLiteralNewlines,
    GOOGLE_SHEET_ID: 'sheet-id',
    ALLOWED_GOOGLE_EMAIL: 'owner@example.com',
    APP_TIME_ZONE: 'Europe/Oslo',
  };
}

describe('parseEnv', () => {
  test('returns a fully populated config object for a valid environment', () => {
    const config = parseEnv(buildValidEnv());

    expect(config.googleClientId).toBe('client-id');
    expect(config.allowedGoogleEmail).toBe('owner@example.com');
    expect(config.appTimeZone).toBe('Europe/Oslo');
  });

  test.each([
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
    'SESSION_SECRET',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_SHEET_ID',
    'ALLOWED_GOOGLE_EMAIL',
    'APP_TIME_ZONE',
  ])('throws naming %s when it is missing', (name) => {
    const source = buildValidEnv();
    delete source[name];

    expect(() => parseEnv(source)).toThrowError(new RegExp(name));
  });

  test('converts literal \\n sequences in the private key to real newlines', () => {
    const config = parseEnv(buildValidEnv());

    expect(config.googleServiceAccountPrivateKey).toContain('\n');
    expect(config.googleServiceAccountPrivateKey).not.toContain('\\n');
    expect(config.googleServiceAccountPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(
      true,
    );
  });

  test('throws at load when the private key is not a valid PEM block', () => {
    const source = buildValidEnv();
    source['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'] = 'not-a-pem-key';

    expect(() => parseEnv(source)).toThrowError(/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  });

  test('rejects a non-IANA timezone', () => {
    const source = buildValidEnv();
    source['APP_TIME_ZONE'] = 'Not/AZone';

    expect(() => parseEnv(source)).toThrowError(/APP_TIME_ZONE/);
  });
});
