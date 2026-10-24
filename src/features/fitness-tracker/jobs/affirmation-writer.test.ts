import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { GeminiOutcome, GenerateJson } from '@/lib/gemini/client';
import { affirmationCategories, type AffirmationCategory } from '../domain/affirmation';
import {
  affirmationResponseSchema,
  affirmationSystemPrompt,
  affirmationUserMessage,
  writeAffirmationSet,
  type Sleep,
} from './affirmation-writer';

function lines(category: AffirmationCategory, count = 7): string[] {
  return Array.from({ length: count }, (_, index) => `You are ${category} legend ${index}`);
}

function fullSet(count = 7): Record<AffirmationCategory, string[]> {
  return Object.fromEntries(
    affirmationCategories.map((category) => [category, lines(category, count)]),
  ) as Record<AffirmationCategory, string[]>;
}

function answer(value: unknown): GeminiOutcome {
  return { ok: true, value };
}

function failure(reason: string, retryable: boolean): GeminiOutcome {
  return { ok: false, reason, retryable };
}

describe('affirmation request', () => {
  it('builds a response schema with a required string array for every category', () => {
    const schema = affirmationResponseSchema();

    expect(schema.type).toBe('OBJECT');
    expect(schema.required).toEqual([...affirmationCategories]);
    for (const category of affirmationCategories) {
      expect(schema.properties?.[category]).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
    }
  });

  it('names every category, the word budget and exactly 7 lines in the prompt', () => {
    for (const category of affirmationCategories) {
      expect(affirmationSystemPrompt).toContain(category);
    }
    expect(affirmationSystemPrompt).toContain('at most 15 words');
    expect(affirmationSystemPrompt).toContain('exactly 7');
  });

  it('gives no example with a digit, so no example invents numbers', () => {
    const examples = affirmationSystemPrompt
      .split('\n')
      .filter((line) => line.trimStart().startsWith('- Example:'));

    expect(examples.length).toBeGreaterThanOrEqual(affirmationCategories.length);
    for (const example of examples) {
      expect(example).not.toMatch(/\d/);
    }
  });
});

describe('writeAffirmationSet', () => {
  let warn: MockInstance<(...data: unknown[]) => void>;
  const sleep = vi.fn<Sleep>(() => Promise.resolve());

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sleep.mockClear();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sends no session facts: the user message is the fixed instruction', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(fullSet()));

    await writeAffirmationSet(generate, sleep);

    expect(affirmationUserMessage).toBe("Write this week's set.");
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      systemInstruction: affirmationSystemPrompt,
      userMessage: affirmationUserMessage,
      responseSchema: affirmationResponseSchema(),
    });
  });

  it('sends a 60 s timeout and 4096 output tokens', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(fullSet()));

    await writeAffirmationSet(generate, sleep);

    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      timeoutMilliseconds: 60_000,
      maxOutputTokens: 4096,
    });
  });

  it('returns the first valid set without retrying', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(fullSet()));

    expect(await writeAffirmationSet(generate, sleep)).toEqual(fullSet());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a timeout, a 503 and a 429, waiting 30 s, 60 s and 120 s', async () => {
    const generate = vi
      .fn<GenerateJson>()
      .mockResolvedValueOnce(failure('timeout', true))
      .mockResolvedValueOnce(failure('status 503', true))
      .mockResolvedValueOnce(failure('status 429', true))
      .mockResolvedValueOnce(answer(fullSet()));

    expect(await writeAffirmationSet(generate, sleep)).toEqual(fullSet());
    expect(generate).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[30_000], [60_000], [120_000]]);
  });

  it('retries an incomplete set', async () => {
    const generate = vi
      .fn<GenerateJson>()
      .mockResolvedValueOnce(answer(fullSet(6)))
      .mockResolvedValueOnce(answer(fullSet()));

    expect(await writeAffirmationSet(generate, sleep)).toEqual(fullSet());
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(failure('status 400', false));

    expect(await writeAffirmationSet(generate, sleep)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Affirmation set failed: status 400');
  });

  it('does not retry a blocked prompt', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(failure('blocked', false));

    expect(await writeAffirmationSet(generate, sleep)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('gives up after 4 attempts', async () => {
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(fullSet(3)));

    expect(await writeAffirmationSet(generate, sleep)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith('Affirmation set failed: invalid set');
  });
});
