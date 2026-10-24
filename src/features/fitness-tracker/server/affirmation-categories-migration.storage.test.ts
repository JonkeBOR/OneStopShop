import { readFile, readdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/server/database';
import { openEmptyTestDatabase } from './storage-test-database';
import { messagesOf, rejectionOf } from './storage-test-support';

const statementBreakpoint = '--> statement-breakpoint';
const affirmationCategoriesMigration = '0013_affirmation_categories.sql';

async function runMigrationFile(db: Database, fileName: string): Promise<void> {
  const text = await readFile(`migrations/${fileName}`, 'utf-8');
  for (const statement of text.split(statementBreakpoint)) {
    if (statement.trim().length > 0) {
      await db.run(sql.raw(statement));
    }
  }
}

async function migrationsBefore(fileName: string): Promise<string[]> {
  const files = await readdir('migrations');
  return files.filter((file) => file.endsWith('.sql') && file < fileName).toSorted();
}

async function seedSession(db: Database): Promise<void> {
  const statements = [
    `INSERT INTO profiles (id, account_subject, active_program_id, created_at) VALUES ('pr', 'affirmation-categories-migration-test', NULL, 1)`,
    `INSERT INTO programs (id, profile_id, name, created_at, deleted_at) VALUES ('prog', 'pr', 'Program', 1, NULL)`,
    `INSERT INTO training_blocks (id, program_id, position, label) VALUES ('block', 'prog', 1, NULL)`,
    `INSERT INTO workouts (id, program_id, position, name) VALUES ('wo', 'prog', 1, 'Workout')`,
    `INSERT INTO cycles (id, program_id, current_block_id, pass) VALUES ('cy', 'prog', 'block', 1)`,
    `INSERT INTO workout_sessions (id, profile_id, program_id, cycle_id, pass, training_block_id, workout_id, status, started_at, finished_at, affirmation, affirmation_requested_at) VALUES ('ses', 'pr', 'prog', 'cy', 1, 'block', 'wo', 'finished', 10, 20, 'old', 15)`,
  ];
  for (const statement of statements) {
    await db.run(sql.raw(statement));
  }
}

describe('affirmation categories migration', () => {
  let db: Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await openEmptyTestDatabase('migration-affirmation-categories'));
    for (const fileName of await migrationsBefore(affirmationCategoriesMigration)) {
      await runMigrationFile(db, fileName);
    }
    await seedSession(db);
    await runMigrationFile(db, affirmationCategoriesMigration);
  }, 120000);

  afterAll(async () => {
    await dispose();
  });

  it('drops both affirmation columns from workout_sessions', async () => {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(workout_sessions)`);
    const names = columns.map((column) => column.name);

    expect(names).toContain('finished_at');
    expect(names).not.toContain('affirmation');
    expect(names).not.toContain('affirmation_requested_at');
  });

  it('keeps the existing sessions', async () => {
    expect(await db.all<{ id: string }>(sql`SELECT id FROM workout_sessions`)).toEqual([
      { id: 'ses' },
    ]);
  });

  it('creates an empty affirmations table', async () => {
    expect(
      await db.all<{ count: number }>(sql`SELECT count(*) AS count FROM affirmations`),
    ).toEqual([{ count: 0 }]);
  });

  it('allows one affirmation per category and position', async () => {
    await db.run(
      sql`INSERT INTO affirmations (id, category, position, text, generated_at) VALUES ('a1', 'fully-completed', 0, 'One', 1)`,
    );

    const error = await rejectionOf(() =>
      db.run(
        sql`INSERT INTO affirmations (id, category, position, text, generated_at) VALUES ('a2', 'fully-completed', 0, 'Two', 1)`,
      ),
    );

    expect(messagesOf(error)).toContain('UNIQUE constraint failed');
  });
});
