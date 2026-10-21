import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/server/database';
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

async function seedOldShape(db: Database): Promise<void> {
  const statements = [
    `INSERT INTO profiles (id, account_subject, active_program_id, created_at) VALUES ('pr', 'migration-test', NULL, 1)`,
    `INSERT INTO exercises (id, profile_id, name, name_key, archived_at, created_at) VALUES ('ex', 'pr', 'Press', 'press', NULL, 1)`,
    `INSERT INTO programs (id, profile_id, name, created_at) VALUES ('prog-a', 'pr', 'A', 1), ('prog-b', 'pr', 'B', 2), ('prog-c', 'pr', 'C', 3), ('prog-d', 'pr', 'D', 4)`,
    `INSERT INTO training_blocks (id, program_id, position, label) VALUES
      ('a1', 'prog-a', 1, NULL), ('a2', 'prog-a', 2, NULL), ('a3', 'prog-a', 3, NULL),
      ('b1', 'prog-b', 1, NULL), ('b2', 'prog-b', 2, NULL), ('b3', 'prog-b', 3, NULL),
      ('c1', 'prog-c', 1, NULL), ('c2', 'prog-c', 2, NULL),
      ('d1', 'prog-d', 1, NULL), ('d2', 'prog-d', 2, NULL), ('d3', 'prog-d', 3, NULL)`,
    `INSERT INTO workouts (id, program_id, position, name) VALUES
      ('wa1', 'prog-a', 1, 'A1'), ('wa2', 'prog-a', 2, 'A2'), ('wb1', 'prog-b', 1, 'B1'),
      ('wc1', 'prog-c', 1, 'C1'), ('wd1', 'prog-d', 1, 'D1')`,
    `INSERT INTO exercise_slots (id, workout_id, position, exercise_id, is_optional) VALUES ('slot', 'wa1', 1, 'ex', 0)`,
    `INSERT INTO cycles (id, program_id, number, status, current_block_number, started_at, ended_at) VALUES
      ('ca1', 'prog-a', 1, 'completed', 3, 1000, 2000),
      ('ca2', 'prog-a', 2, 'ended_early', 2, 2000, 3000),
      ('ca3', 'prog-a', 3, 'active', 2, 3000, NULL),
      ('cb1', 'prog-b', 1, 'ended_early', 3, 1000, 2000),
      ('cd1', 'prog-d', 1, 'active', 4, 1000, NULL)`,
    `INSERT INTO workout_sessions (id, profile_id, program_id, cycle_id, workout_id, cycle_number, block_number, status, started_at, finished_at) VALUES
      ('s1', 'pr', 'prog-a', 'ca1', 'wa1', 1, 1, 'finished', 1100, 1200),
      ('s2', 'pr', 'prog-a', 'ca1', 'wa2', 1, 1, 'finished', 1300, 1400),
      ('s3', 'pr', 'prog-a', 'ca2', 'wa1', 2, 1, 'finished', 2100, 2200),
      ('s4', 'pr', 'prog-a', 'ca3', 'wa1', 3, 1, 'finished', 3100, 3200),
      ('s5', 'pr', 'prog-a', 'ca3', 'wa1', 3, 2, 'in_progress', 3300, NULL),
      ('sb', 'pr', 'prog-b', 'cb1', 'wb1', 1, 1, 'finished', 1100, 1200),
      ('o1', 'pr', 'gone', 'gone-c1', 'gone-w', 1, 1, 'finished', 100, 200),
      ('o2', 'pr', 'gone', 'gone-c1', 'gone-w', 1, 2, 'finished', 300, 400)`,
    `INSERT INTO set_logs (id, profile_id, exercise_id, performed_at, set_number, reps, weight_grams, program_id, cycle_id, training_block_id, workout_id, exercise_slot_id, workout_session_id, cycle_number, block_number) VALUES
      ('log1', 'pr', 'ex', 2150, 1, 10, 42500, 'prog-a', 'ca2', 'a1', 'wa1', 'slot', 's3', 2, 1)`,
    `UPDATE profiles SET active_program_id = 'prog-a' WHERE id = 'pr'`,
  ];
  for (const statement of statements) {
    await db.run(sql.raw(statement));
  }
}

describe('cycle container migration', () => {
  let db: Database;
  let dispose: () => Promise<void>;
  let setLogsBefore: unknown[];

  beforeAll(async () => {
    ({ db, dispose } = await openEmptyTestDatabase('migration-v3'));
    await runMigrationFile(db, '0000_fitness_domain.sql');
    await runMigrationFile(db, '0001_set_log_immutability.sql');
    await runMigrationFile(db, '0002_cycle_container_columns.sql');
    await seedOldShape(db);
    setLogsBefore = await db.all(sql`SELECT * FROM set_logs ORDER BY id`);
    await runMigrationFile(db, '0003_cycle_container_data.sql');
  }, 120000);

  afterAll(async () => {
    await dispose();
  });

  it('FR-045: keeps one cycle per program, choosing the active one or else the latest', async () => {
    const rows = await db.all<{
      id: string;
      program_id: string;
      pass: number;
      current_block_id: string;
    }>(sql`SELECT id, program_id, pass, current_block_id FROM cycles ORDER BY program_id`);

    expect(rows.map((row) => row.program_id)).toEqual(['prog-a', 'prog-b', 'prog-c', 'prog-d']);
    expect(rows.find((row) => row.program_id === 'prog-a')).toMatchObject({
      id: 'ca3',
      pass: 3,
      current_block_id: 'a2',
    });
    expect(rows.find((row) => row.program_id === 'prog-b')).toMatchObject({
      id: 'cb1',
      pass: 1,
      current_block_id: 'b3',
    });
  });

  it('FR-045: gives a program that had no cycle a first pass on its first block', async () => {
    const [row] = await db.all<{ pass: number; current_block_id: string }>(
      sql`SELECT pass, current_block_id FROM cycles WHERE program_id = 'prog-c'`,
    );

    expect(row).toEqual({ pass: 1, current_block_id: 'c1' });
  });

  it('FR-045: moves a cycle whose block no longer exists to the last block', async () => {
    const [row] = await db.all<{ current_block_id: string }>(
      sql`SELECT current_block_id FROM cycles WHERE program_id = 'prog-d'`,
    );

    expect(row?.current_block_id).toBe('d3');
  });

  it('R3, FR-045: points every session at the kept cycle, its pass and its block', async () => {
    const rows = await db.all<{
      id: string;
      cycle_id: string;
      pass: number;
      training_block_id: string;
    }>(sql`SELECT id, cycle_id, pass, training_block_id FROM workout_sessions ORDER BY id`);

    expect(rows).toEqual([
      { id: 'o1', cycle_id: 'gone-c1', pass: 1, training_block_id: 'removed-1' },
      { id: 'o2', cycle_id: 'gone-c1', pass: 1, training_block_id: 'removed-2' },
      { id: 's1', cycle_id: 'ca3', pass: 1, training_block_id: 'a1' },
      { id: 's2', cycle_id: 'ca3', pass: 1, training_block_id: 'a1' },
      { id: 's3', cycle_id: 'ca3', pass: 2, training_block_id: 'a1' },
      { id: 's4', cycle_id: 'ca3', pass: 3, training_block_id: 'a1' },
      { id: 's5', cycle_id: 'ca3', pass: 3, training_block_id: 'a2' },
      { id: 'sb', cycle_id: 'cb1', pass: 1, training_block_id: 'b1' },
    ]);
  });

  it('R5: the final schema keeps the data, drops the old columns and leaves set logs untouched', async () => {
    await runMigrationFile(db, '0004_cycle_container_schema.sql');

    const columns = async (table: string) =>
      (await db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`)))
        .map((column) => column.name)
        .sort();
    expect(await columns('cycles')).toEqual(['current_block_id', 'id', 'pass', 'program_id']);
    expect(await columns('workout_sessions')).toEqual([
      'cycle_id',
      'finished_at',
      'id',
      'pass',
      'profile_id',
      'program_id',
      'started_at',
      'status',
      'training_block_id',
      'workout_id',
    ]);
    expect(await db.all(sql`SELECT * FROM set_logs ORDER BY id`)).toEqual(setLogsBefore);
    const triggers = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`,
    );
    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'set_logs_no_delete',
      'set_logs_no_update',
    ]);
    const sessions = await db.all(
      sql`SELECT id, cycle_id, pass, training_block_id FROM workout_sessions WHERE program_id = 'prog-a' ORDER BY id`,
    );
    expect(sessions).toHaveLength(5);
  });

  it('R5: allows one session per workout per block per pass and rejects a duplicate', async () => {
    await expect(
      db.run(
        sql`INSERT INTO workout_sessions (id, profile_id, program_id, cycle_id, workout_id, pass, training_block_id, status, started_at, finished_at) VALUES ('dup', 'pr', 'prog-a', 'ca3', 'wa1', 3, 'a1', 'finished', 1, 2)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.run(
        sql`INSERT INTO workout_sessions (id, profile_id, program_id, cycle_id, workout_id, pass, training_block_id, status, started_at, finished_at) VALUES ('next', 'pr', 'prog-a', 'ca3', 'wa1', 4, 'a1', 'finished', 1, 2)`,
      ),
    ).resolves.toBeDefined();
  });

  it('FR-045: rejects a second cycle for the same program', async () => {
    await expect(
      db.run(
        sql`INSERT INTO cycles (id, program_id, current_block_id, pass) VALUES ('second', 'prog-a', 'a1', 1)`,
      ),
    ).rejects.toThrow();
  });
});
