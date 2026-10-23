import { readFile, readdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/server/database';
import { openEmptyTestDatabase } from './storage-test-database';
import { messagesOf, rejectionOf } from './storage-test-support';

const statementBreakpoint = '--> statement-breakpoint';
const defaultVariantsMigration = '0011_default_variants.sql';

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

async function seedHistory(db: Database): Promise<void> {
  const statements = [
    `INSERT INTO profiles (id, account_subject, active_program_id, created_at) VALUES ('pr', 'default-variants-migration-test', NULL, 1)`,
    `INSERT INTO programs (id, profile_id, name, created_at, deleted_at) VALUES ('prog', 'pr', 'Program', 1, NULL)`,
    `INSERT INTO training_blocks (id, program_id, position, label) VALUES ('block', 'prog', 1, NULL)`,
    `INSERT INTO workouts (id, program_id, position, name) VALUES ('wo', 'prog', 1, 'Workout')`,
    `INSERT INTO cycles (id, program_id, current_block_id, pass) VALUES ('cy', 'prog', 'block', 1)`,
    `INSERT INTO workout_sessions (id, profile_id, program_id, cycle_id, pass, training_block_id, workout_id, status, started_at, finished_at) VALUES ('ses', 'pr', 'prog', 'cy', 1, 'block', 'wo', 'finished', 10, 20)`,
    `INSERT INTO exercises (id, profile_id, name, name_key, archived_at, created_at) VALUES
      ('plain', 'pr', 'Plain', 'plain', NULL, 1),
      ('split', 'pr', 'Split', 'split', NULL, 1),
      ('retired', 'pr', 'Retired', 'retired', NULL, 1)`,
    `INSERT INTO exercise_variants (id, exercise_id, name, name_key, created_at, removed_at) VALUES
      ('split-a', 'split', 'Gym A', 'gym a', 1, NULL),
      ('split-b', 'split', 'Gym B', 'gym b', 2, NULL),
      ('retired-r', 'retired', 'Old gym', 'old gym', 1, 5)`,
    `INSERT INTO exercise_slots (id, workout_id, position, exercise_id, is_optional, is_periodized) VALUES
      ('plain-slot', 'wo', 1, 'plain', 0, 1),
      ('split-slot', 'wo', 2, 'split', 0, 1),
      ('retired-slot', 'wo', 3, 'retired', 0, 1)`,
    `INSERT INTO planned_sets (id, exercise_slot_id, training_block_id, set_number, target_reps, last_weight_grams, variant_id) VALUES
      ('plain-ps1', 'plain-slot', 'block', 1, 8, 40000, NULL),
      ('plain-ps2', 'plain-slot', 'block', 2, 8, NULL, NULL),
      ('split-ps', 'split-slot', 'block', 1, 8, 50000, 'split-b'),
      ('retired-ps', 'retired-slot', 'block', 1, 8, 30000, NULL)`,
    `INSERT INTO set_logs (id, profile_id, exercise_id, performed_at, set_number, reps, weight_grams, program_id, cycle_id, training_block_id, workout_id, exercise_slot_id, workout_session_id, cycle_number, block_number, variant_id) VALUES
      ('plain-log1', 'pr', 'plain', 11, 1, 8, 40000, 'prog', 'cy', 'block', 'wo', 'plain-slot', 'ses', 1, 1, NULL),
      ('plain-log2', 'pr', 'plain', 12, 2, 8, NULL, 'prog', 'cy', 'block', 'wo', 'plain-slot', 'ses', 1, 1, NULL),
      ('split-log-null', 'pr', 'split', 13, 1, 8, 50000, 'prog', 'cy', 'block', 'wo', 'split-slot', 'ses', 1, 1, NULL),
      ('split-log-b', 'pr', 'split', 14, 2, 8, 50000, 'prog', 'cy', 'block', 'wo', 'split-slot', 'ses', 1, 1, 'split-b'),
      ('retired-log-null', 'pr', 'retired', 15, 1, 8, 30000, 'prog', 'cy', 'block', 'wo', 'retired-slot', 'ses', 1, 1, NULL),
      ('retired-log-r', 'pr', 'retired', 16, 2, 8, 30000, 'prog', 'cy', 'block', 'wo', 'retired-slot', 'ses', 1, 1, 'retired-r')`,
  ];
  for (const statement of statements) {
    await db.run(sql.raw(statement));
  }
}

type VariantRow = { id: string; name: string; name_key: string; removed_at: number | null };
type PlannedSetRow = { id: string; variant_id: string | null; last_weight_grams: number | null };
type SetLogRow = { id: string; variant_id: string | null };

const generatedId = /^[0-9a-f]{32}$/;

function describeVariant({ name, name_key, removed_at }: VariantRow): Omit<VariantRow, 'id'> {
  return { name, name_key, removed_at };
}

describe('default variants migration', () => {
  let db: Database;
  let dispose: () => Promise<void>;

  async function variantsOf(exerciseId: string): Promise<VariantRow[]> {
    return db.all<VariantRow>(
      sql`SELECT id, name, name_key, removed_at FROM exercise_variants WHERE exercise_id = ${exerciseId} ORDER BY created_at, id`,
    );
  }

  async function plannedSetsOf(slotId: string): Promise<PlannedSetRow[]> {
    return db.all<PlannedSetRow>(
      sql`SELECT id, variant_id, last_weight_grams FROM planned_sets WHERE exercise_slot_id = ${slotId} ORDER BY id`,
    );
  }

  async function setLogsOf(exerciseId: string): Promise<SetLogRow[]> {
    return db.all<SetLogRow>(
      sql`SELECT id, variant_id FROM set_logs WHERE exercise_id = ${exerciseId} ORDER BY id`,
    );
  }

  beforeAll(async () => {
    ({ db, dispose } = await openEmptyTestDatabase('migration-default-variants'));
    for (const fileName of await migrationsBefore(defaultVariantsMigration)) {
      await runMigrationFile(db, fileName);
    }
    await seedHistory(db);
    await runMigrationFile(db, defaultVariantsMigration);
  }, 120000);

  afterAll(async () => {
    await dispose();
  });

  it('gives an exercise without variants one active Default and moves its planned sets and logs onto it', async () => {
    const variants = await variantsOf('plain');
    const defaultId = variants[0]?.id;
    expect(variants.map(describeVariant)).toEqual([
      { name: 'Default', name_key: 'default', removed_at: null },
    ]);
    expect(defaultId).toMatch(generatedId);

    expect(await plannedSetsOf('plain-slot')).toEqual([
      { id: 'plain-ps1', variant_id: defaultId, last_weight_grams: 40000 },
      { id: 'plain-ps2', variant_id: defaultId, last_weight_grams: null },
    ]);
    expect(await setLogsOf('plain')).toEqual([
      { id: 'plain-log1', variant_id: defaultId },
      { id: 'plain-log2', variant_id: defaultId },
    ]);
  });

  it('leaves an exercise with active variants alone and gives its unassigned logs the oldest variant', async () => {
    expect((await variantsOf('split')).map((variant) => variant.id)).toEqual([
      'split-a',
      'split-b',
    ]);
    expect(await plannedSetsOf('split-slot')).toEqual([
      { id: 'split-ps', variant_id: 'split-b', last_weight_grams: 50000 },
    ]);
    expect(await setLogsOf('split')).toEqual([
      { id: 'split-log-b', variant_id: 'split-b' },
      { id: 'split-log-null', variant_id: 'split-a' },
    ]);
  });

  it('gives an exercise with only retired variants a fresh Default, and its unassigned logs the oldest retired one', async () => {
    const variants = await variantsOf('retired');
    const defaultId = variants[1]?.id;
    expect(variants.map(describeVariant)).toEqual([
      { name: 'Old gym', name_key: 'old gym', removed_at: 5 },
      { name: 'Default', name_key: 'default', removed_at: null },
    ]);
    expect(variants[0]?.id).toBe('retired-r');
    expect(defaultId).toMatch(generatedId);

    expect(await plannedSetsOf('retired-slot')).toEqual([
      { id: 'retired-ps', variant_id: defaultId, last_weight_grams: 30000 },
    ]);
    expect(await setLogsOf('retired')).toEqual([
      { id: 'retired-log-null', variant_id: 'retired-r' },
      { id: 'retired-log-r', variant_id: 'retired-r' },
    ]);
  });

  it('leaves no planned set or set log without a variant', async () => {
    const [plannedSets] = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) AS count FROM planned_sets WHERE variant_id IS NULL`,
    );
    const [setLogs] = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) AS count FROM set_logs WHERE variant_id IS NULL`,
    );

    expect(plannedSets?.count).toBe(0);
    expect(setLogs?.count).toBe(0);
  });

  it('keeps set logs immutable afterwards', async () => {
    const update = await rejectionOf(async () => {
      await db.run(sql`UPDATE set_logs SET reps = 1`);
    });

    expect(messagesOf(update)).toContain('set_logs are immutable');
  });
});
