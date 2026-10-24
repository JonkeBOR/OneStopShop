import 'server-only';

export type Config = {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  ownerEmail: string;
};

type Environment = Record<string, string | undefined>;

const requiredVariables = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'OWNER_EMAIL',
] as const;

export function readConfig(env: Environment): Config {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing configuration: ${missing.join(', ')}`);
  }
  return {
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    sessionSecret: env.SESSION_SECRET ?? '',
    ownerEmail: (env.OWNER_EMAIL ?? '').trim().toLowerCase(),
  };
}

export function getConfig(): Config {
  return readConfig(process.env);
}
