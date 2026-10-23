import 'server-only';

export type Config = {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  ownerEmail: string;
};

export type GeminiConfig = { apiKey: string };

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

export function readGeminiConfig(env: Environment): GeminiConfig | null {
  const isEnabled = env.GEMINI_ENABLED?.trim() === 'true';
  const apiKey = env.GEMINI_API_KEY?.trim();
  return isEnabled && apiKey ? { apiKey } : null;
}

export function getConfig(): Config {
  return readConfig(process.env);
}

export function getGeminiConfig(): GeminiConfig | null {
  return readGeminiConfig(process.env);
}
