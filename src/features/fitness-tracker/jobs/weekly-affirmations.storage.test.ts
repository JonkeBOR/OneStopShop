import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiOutcome, GenerateJson } from '@/lib/gemini/client';
import type { AffirmationSet } from '../domain/affirmation';
import {
  readAffirmations,
  readAffirmationSetGeneratedAt,
  replaceAffirmationSet,
} from '../server/affirmations';
import { affirmations } from '../server/schema';
import { openTestDatabase, type TestDatabase } from '../server/storage-test-database';
import { affirmationSetOf } from '../server/storage-test-support';
import type { Sleep } from './affirmation-writer';
import { runWeeklyAffirmations } from './weekly-affirmations';

const wednesday = new Date('2026-10-28T03:00:00Z');
const thisMonday = new Date('2026-10-26T03:00:00Z');
const lastSunday = new Date('2026-10-25T03:00:00Z');

function answer(set: AffirmationSet): GeminiOutcome {
  return { ok: true, value: set };
}

describe('runWeeklyAffirmations', () => {
  let testDatabase: TestDatabase;
  const sleep = vi.fn<Sleep>(() => Promise.resolve());

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    sleep.mockClear();
    await testDatabase.db.delete(affirmations);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates when the table is empty', async () => {
    const { db } = testDatabase;
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(affirmationSetOf('new')));

    expect(await runWeeklyAffirmations(db, generate, wednesday, sleep)).toBe('replaced');
    expect(await db.select().from(affirmations)).toHaveLength(42);
    expect(await readAffirmationSetGeneratedAt(db)).toEqual(wednesday);
  });

  it('does nothing when the set is from this week', async () => {
    const { db } = testDatabase;
    await replaceAffirmationSet(db, affirmationSetOf('current'), thisMonday);
    const generate = vi.fn<GenerateJson>();

    expect(await runWeeklyAffirmations(db, generate, wednesday, sleep)).toBe('current');
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates when the set is from before this Monday', async () => {
    const { db } = testDatabase;
    await replaceAffirmationSet(db, affirmationSetOf('old'), lastSunday);
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(affirmationSetOf('new')));

    expect(await runWeeklyAffirmations(db, generate, thisMonday, sleep)).toBe('replaced');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('replaces the whole old set on success', async () => {
    const { db } = testDatabase;
    await replaceAffirmationSet(db, affirmationSetOf('old'), lastSunday);
    const generate = vi.fn<GenerateJson>().mockResolvedValue(answer(affirmationSetOf('new')));

    await runWeeklyAffirmations(db, generate, wednesday, sleep);

    const texts = (await db.select().from(affirmations)).map((row) => row.text);
    expect(texts).toHaveLength(42);
    expect(texts.some((text) => text.startsWith('old '))).toBe(false);
  });

  it('leaves the old set untouched when generation fails', async () => {
    const { db } = testDatabase;
    await replaceAffirmationSet(db, affirmationSetOf('old'), lastSunday);
    const generate = vi
      .fn<GenerateJson>()
      .mockResolvedValue({ ok: false, reason: 'status 503', retryable: true });

    expect(await runWeeklyAffirmations(db, generate, wednesday, sleep)).toBe('failed');
    expect(await readAffirmations(db, 'fully-completed')).toEqual(
      affirmationSetOf('old')['fully-completed'],
    );
    expect(await readAffirmationSetGeneratedAt(db)).toEqual(lastSunday);
  });

  it('makes no request when disabled', async () => {
    const { db } = testDatabase;

    expect(await runWeeklyAffirmations(db, null, wednesday, sleep)).toBe('disabled');
    expect(await db.select().from(affirmations)).toHaveLength(0);
  });
});
