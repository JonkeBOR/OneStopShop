import { readFile, readdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/server/database';
import type { AffirmationCategory } from '../domain/affirmation';
import type { Program, SessionView } from '../domain/types';
import { activateProgram } from './activation';
import { finishedSessionAffirmation, readAffirmations } from './affirmations';
import { ensureProfile } from './profile';
import { affirmations } from './schema';
import {
  openEmptyTestDatabase,
  openTestDatabase,
  type TestDatabase,
} from './storage-test-database';
import { createProgramFromSpec, expectOk, type ProgramSpec } from './storage-test-support';
import { finishWorkout, getSession, logSet, startWorkout } from './training';

const statementBreakpoint = '--> statement-breakpoint';

function linesFor(category: AffirmationCategory): string[] {
  return Array.from({ length: 7 }, (_, position) => `${category} line ${position}`);
}

async function seed(db: Database, category: AffirmationCategory, texts: string[]): Promise<void> {
  await db.insert(affirmations).values(
    texts.map((text, position) => ({
      id: crypto.randomUUID(),
      category,
      position,
      text,
      generatedAt: new Date('2026-10-19T03:00:00Z'),
    })),
  );
}

describe('affirmations', () => {
  let testDatabase: TestDatabase;
  let profileId: string;
  let program: Program;
  let clock: number;

  const sevenWorkouts: ProgramSpec = {
    blockCount: 1,
    workouts: Array.from({ length: 7 }, (_, index) => ({
      name: `Day ${index + 1}`,
      slots: [{ exercise: 'Press', targetReps: [5] }],
    })),
  };

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  beforeEach(async () => {
    const { db } = testDatabase;
    await db.delete(affirmations);
    clock = Date.parse('2026-10-19T08:00:00Z');
    profileId = (await ensureProfile(db, crypto.randomUUID(), tick())).id;
    program = await createProgramFromSpec(db, profileId, sevenWorkouts, tick());
    expectOk(await activateProgram(db, profileId, program.id, tick()));
  });

  function tick(): Date {
    clock += 60_000;
    return new Date(clock);
  }

  async function finishCompleted(index: number): Promise<SessionView> {
    const { db } = testDatabase;
    const started = expectOk(
      await startWorkout(db, profileId, program.workouts[index]?.id ?? '', tick()),
    );
    expectOk(
      await logSet(
        db,
        profileId,
        started.id,
        started.slots[0]?.plannedSets[0]?.id ?? '',
        { reps: 5, weightKg: 100 },
        tick(),
      ),
    );
    expectOk(await finishWorkout(db, profileId, started.id, tick()));
    return expectOk(await getSession(db, profileId, started.id));
  }

  it('reads one category in position order', async () => {
    const { db } = testDatabase;
    const generatedAt = new Date('2026-10-19T03:00:00Z');
    await db.insert(affirmations).values([
      { id: 'a3', category: 'skipped-sets', position: 2, text: 'third', generatedAt },
      { id: 'a1', category: 'skipped-sets', position: 0, text: 'first', generatedAt },
      { id: 'a2', category: 'skipped-sets', position: 1, text: 'second', generatedAt },
    ]);
    await seed(db, 'fully-completed', ['other']);

    expect(await readAffirmations(db, 'skipped-sets')).toEqual(['first', 'second', 'third']);
  });

  it('gives a line from the category the session achieved', async () => {
    const { db } = testDatabase;
    await seed(db, 'fully-completed', linesFor('fully-completed'));
    await seed(db, 'skipped-whole-workout', linesFor('skipped-whole-workout'));

    const session = await finishCompleted(0);

    expect(linesFor('fully-completed')).toContain(
      await finishedSessionAffirmation(db, profileId, session),
    );
  });

  it('gives consecutive sessions in a week different lines', async () => {
    const { db } = testDatabase;
    await seed(db, 'fully-completed', linesFor('fully-completed'));
    const shown: (string | null)[] = [];

    for (let index = 0; index < 7; index += 1) {
      const session = await finishCompleted(index);
      shown.push(await finishedSessionAffirmation(db, profileId, session));
    }

    expect(shown).toEqual(linesFor('fully-completed'));
  });

  it('gives nothing when the category has no affirmations', async () => {
    const { db } = testDatabase;
    await seed(db, 'skipped-whole-workout', linesFor('skipped-whole-workout'));

    const session = await finishCompleted(0);

    expect(await finishedSessionAffirmation(db, profileId, session)).toBeNull();
  });
});

describe('affirmations when storage fails', () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await openEmptyTestDatabase('affirmations-storage-fails');
    const files = (await readdir('migrations')).filter((file) => file.endsWith('.sql'));
    for (const file of files.toSorted()) {
      const text = await readFile(`migrations/${file}`, 'utf-8');
      for (const statement of text.split(statementBreakpoint)) {
        if (statement.trim().length > 0) {
          await testDatabase.db.run(sql.raw(statement));
        }
      }
    }
  }, 120000);

  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('gives nothing when reading fails', async () => {
    const { db } = testDatabase;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await db.run(sql`DROP TABLE affirmations`);
    const profileId = (await ensureProfile(db, crypto.randomUUID(), new Date())).id;
    const session: SessionView = {
      id: 'session',
      status: 'finished',
      startedAt: new Date('2026-10-19T08:00:00Z'),
      finishedAt: new Date('2026-10-19T09:00:00Z'),
      workout: { id: 'workout', name: 'Day' },
      block: { id: 'block', number: 1, label: null },
      slots: [],
    };

    expect(await finishedSessionAffirmation(db, profileId, session)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Affirmation failed: storage');
    warn.mockRestore();
  });
});
