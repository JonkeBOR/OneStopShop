import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailyAffirmationCap } from '../domain/affirmation';
import { activateProgram } from './activation';
import { claimAffirmation, readAffirmation, saveAffirmation } from './affirmations';
import { ensureProfile } from './profile';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import { activeOverview, createProgramFromSpec, expectOk } from './storage-test-support';
import { finishWorkout, startWorkout } from './training';

describe('affirmations', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  const now = new Date('2026-10-02T10:00:00Z');
  const dayInMilliseconds = 86_400_000;

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    const { db } = testDatabase;
    profileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;
    const program = await createProgramFromSpec(
      db,
      profileId,
      {
        blockCount: 1,
        workouts: [{ name: 'Only', slots: [{ exercise: 'Row', targetReps: [10] }] }],
      },
      now,
    );
    expectOk(await activateProgram(db, profileId, program.id, now));
  });

  async function startedSessionId(at: Date): Promise<string> {
    const { db } = testDatabase;
    const overview = await activeOverview(db, profileId);
    const workoutId = overview.suggestedWorkoutId ?? overview.workouts[0]?.id ?? '';
    return expectOk(await startWorkout(db, profileId, workoutId, at)).id;
  }

  async function finishedSessionId(at: Date): Promise<string> {
    const sessionId = await startedSessionId(at);
    expectOk(await finishWorkout(testDatabase.db, profileId, sessionId, at));
    return sessionId;
  }

  async function claimTenSessions(at: Date): Promise<void> {
    for (let index = 0; index < dailyAffirmationCap; index += 1) {
      const sessionId = await finishedSessionId(at);
      expect(await claimAffirmation(testDatabase.db, profileId, sessionId, at)).toBe(true);
    }
  }

  it('claims a finished session once', async () => {
    const { db } = testDatabase;
    const sessionId = await finishedSessionId(now);

    expect(await claimAffirmation(db, profileId, sessionId, now)).toBe(true);
    expect(await claimAffirmation(db, profileId, sessionId, now)).toBe(false);
  });

  it('does not claim a session that is not finished', async () => {
    const sessionId = await startedSessionId(now);

    expect(await claimAffirmation(testDatabase.db, profileId, sessionId, now)).toBe(false);
  });

  it("does not claim another profile's session", async () => {
    const { db } = testDatabase;
    const sessionId = await finishedSessionId(now);
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    expect(await claimAffirmation(db, otherProfileId, sessionId, now)).toBe(false);
    expect(await claimAffirmation(db, profileId, sessionId, now)).toBe(true);
  });

  it('stops claiming at the daily cap', async () => {
    await claimTenSessions(now);
    const eleventh = await finishedSessionId(now);

    expect(await claimAffirmation(testDatabase.db, profileId, eleventh, now)).toBe(false);
  });

  it('counts only claims from the last 24 hours', async () => {
    await claimTenSessions(new Date(now.getTime() - dayInMilliseconds - 1));
    const sessionId = await finishedSessionId(now);

    expect(await claimAffirmation(testDatabase.db, profileId, sessionId, now)).toBe(true);
  });

  it('reads nothing before an affirmation is saved', async () => {
    const sessionId = await finishedSessionId(now);

    expect(await readAffirmation(testDatabase.db, profileId, sessionId)).toBeNull();
  });

  it('saves an affirmation and reads it back', async () => {
    const { db } = testDatabase;
    const sessionId = await finishedSessionId(now);

    await saveAffirmation(db, profileId, sessionId, 'Huge.');

    expect(await readAffirmation(db, profileId, sessionId)).toBe('Huge.');
  });

  it('does not overwrite a saved affirmation', async () => {
    const { db } = testDatabase;
    const sessionId = await finishedSessionId(now);

    await saveAffirmation(db, profileId, sessionId, 'First.');
    await saveAffirmation(db, profileId, sessionId, 'Second.');

    expect(await readAffirmation(db, profileId, sessionId)).toBe('First.');
  });

  it("does not save to another profile's session", async () => {
    const { db } = testDatabase;
    const sessionId = await finishedSessionId(now);
    const otherProfileId = (await ensureProfile(db, crypto.randomUUID(), now)).id;

    await saveAffirmation(db, otherProfileId, sessionId, 'Not yours.');

    expect(await readAffirmation(db, profileId, sessionId)).toBeNull();
  });
});
