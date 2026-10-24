import { readFile, readdir } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/server/database';
import { workoutSessions } from './schema';
import { openEmptyTestDatabase } from './storage-test-database';

const statementBreakpoint = '--> statement-breakpoint';

async function runMigrationFile(db: Database, fileName: string): Promise<void> {
  const text = await readFile(`migrations/${fileName}`, 'utf-8');
  for (const statement of text.split(statementBreakpoint)) {
    if (statement.trim().length > 0) {
      await db.run(sql.raw(statement));
    }
  }
}

async function allMigrations(): Promise<string[]> {
  const files = await readdir('migrations');
  return files.filter((file) => file.endsWith('.sql')).toSorted();
}

describe('a session in a database without the per-session affirmation columns', () => {
  let db: Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await openEmptyTestDatabase('session-without-affirmation-columns'));
    for (const fileName of await allMigrations()) {
      await runMigrationFile(db, fileName);
    }
    await db.run(sql`ALTER TABLE workout_sessions DROP COLUMN affirmation`);
    await db.run(sql`ALTER TABLE workout_sessions DROP COLUMN affirmation_requested_at`);
    await db.run(
      sql`INSERT INTO profiles (id, account_subject, active_program_id, created_at) VALUES ('pr', 'session-without-affirmation-columns-test', NULL, 1)`,
    );
  }, 120000);

  afterAll(async () => {
    await dispose();
  });

  it('can be stored, finished and read back through the schema', async () => {
    await db.insert(workoutSessions).values({
      id: 'ses',
      profileId: 'pr',
      programId: 'prog',
      cycleId: 'cy',
      pass: 1,
      trainingBlockId: 'block',
      workoutId: 'wo',
      status: 'in_progress',
      startedAt: new Date(10),
    });
    await db
      .update(workoutSessions)
      .set({ status: 'finished', finishedAt: new Date(20) })
      .where(eq(workoutSessions.id, 'ses'));

    expect(await db.select().from(workoutSessions)).toEqual([
      {
        id: 'ses',
        profileId: 'pr',
        programId: 'prog',
        cycleId: 'cy',
        pass: 1,
        trainingBlockId: 'block',
        workoutId: 'wo',
        status: 'finished',
        startedAt: new Date(10),
        finishedAt: new Date(20),
      },
    ]);
  });
});
