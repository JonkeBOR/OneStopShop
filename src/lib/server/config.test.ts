import { expect, test } from 'vitest';
import { readConfig, readGeminiConfig } from './config';

const completeEnv = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret-value',
  SESSION_SECRET: 'session-secret-value',
  OWNER_EMAIL: '  Owner@Example.com ',
};

test('reads every variable and normalises the owner email', () => {
  expect(readConfig(completeEnv)).toEqual({
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret-value',
    sessionSecret: 'session-secret-value',
    ownerEmail: 'owner@example.com',
  });
});

test('names every missing or empty variable without revealing any value', () => {
  const read = (): unknown =>
    readConfig({
      GOOGLE_CLIENT_SECRET: 'client-secret-value',
      SESSION_SECRET: '',
      OWNER_EMAIL: ' ',
    });

  expect(read).toThrow(/GOOGLE_CLIENT_ID/);
  expect(read).toThrow(/SESSION_SECRET/);
  expect(read).toThrow(/OWNER_EMAIL/);
  expect(read).not.toThrow(/client-secret-value/);
  expect(read).not.toThrow(/GOOGLE_CLIENT_SECRET/);
});

test('reads the Gemini key, trimmed', () => {
  expect(readGeminiConfig({ GEMINI_API_KEY: '  gemini-key  ' })).toEqual({ apiKey: 'gemini-key' });
});

test('has no Gemini config when the key is missing or blank', () => {
  expect(readGeminiConfig({})).toBeNull();
  expect(readGeminiConfig({ GEMINI_API_KEY: '   ' })).toBeNull();
});

test('does not require the Gemini key for the rest of the configuration', () => {
  expect(() => readConfig(completeEnv)).not.toThrow();
});
