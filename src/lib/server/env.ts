import 'server-only';

export type AppEnv = {
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly googleOAuthRedirectUri: string;
  readonly sessionSecret: string;
  readonly googleServiceAccountEmail: string;
  readonly googleServiceAccountPrivateKey: string;
  readonly googleSheetId: string;
  readonly allowedGoogleEmail: string;
  readonly appTimeZone: string;
};

type EnvSource = Readonly<Record<string, string | undefined>>;

const PEM_PATTERN = /^-----BEGIN PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END PRIVATE KEY-----\r?\n?$/;

function requireVariable(source: EnvSource, name: string): string {
  const value = source[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePrivateKey(source: EnvSource): string {
  const name = 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY';
  const withRealNewlines = requireVariable(source, name).replace(/\\n/g, '\n');
  if (!PEM_PATTERN.test(withRealNewlines)) {
    throw new Error(`${name} is not a valid PEM private key`);
  }
  return withRealNewlines;
}

function parseTimeZone(source: EnvSource): string {
  const name = 'APP_TIME_ZONE';
  const value = requireVariable(source, name);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    throw new Error(`${name} is not a valid IANA timezone: ${value}`);
  }
  return value;
}

export function parseEnv(source: EnvSource): AppEnv {
  return {
    googleClientId: requireVariable(source, 'GOOGLE_CLIENT_ID'),
    googleClientSecret: requireVariable(source, 'GOOGLE_CLIENT_SECRET'),
    googleOAuthRedirectUri: requireVariable(source, 'GOOGLE_OAUTH_REDIRECT_URI'),
    sessionSecret: requireVariable(source, 'SESSION_SECRET'),
    googleServiceAccountEmail: requireVariable(source, 'GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    googleServiceAccountPrivateKey: parsePrivateKey(source),
    googleSheetId: requireVariable(source, 'GOOGLE_SHEET_ID'),
    allowedGoogleEmail: requireVariable(source, 'ALLOWED_GOOGLE_EMAIL'),
    appTimeZone: parseTimeZone(source),
  };
}

export const env: AppEnv = parseEnv(process.env);
