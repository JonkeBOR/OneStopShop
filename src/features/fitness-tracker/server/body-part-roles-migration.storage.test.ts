import { readFile, readdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/server/database';
import { openEmptyTestDatabase } from './storage-test-database';

const statementBreakpoint = '--> statement-breakpoint';
const roleMigration = '0008_body_part_roles.sql';

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

describe('body part roles migration', () => {
  let db: Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await openEmptyTestDatabase('migration-body-part-roles'));
    for (const fileName of await migrationsBefore(roleMigration)) {
      await runMigrationFile(db, fileName);
    }
    for (const statement of [
      `INSERT INTO profiles (id, account_subject, active_program_id, created_at) VALUES ('pr', 'roles-migration-test', NULL, 1)`,
      `INSERT INTO exercises (id, profile_id, name, name_key, archived_at, created_at) VALUES ('ex', 'pr', 'Bench', 'bench', NULL, 1)`,
      `INSERT INTO exercise_body_parts (exercise_id, body_part_id) VALUES ('ex', 'chest'), ('ex', 'triceps')`,
    ]) {
      await db.run(sql.raw(statement));
    }
    await runMigrationFile(db, roleMigration);
  }, 120000);

  afterAll(async () => {
    await dispose();
  });

  it('makes every existing link primary', async () => {
    const rows = await db.all<{ body_part_id: string; role: string }>(
      sql`SELECT body_part_id, role FROM exercise_body_parts ORDER BY body_part_id`,
    );

    expect(rows).toEqual([
      { body_part_id: 'chest', role: 'primary' },
      { body_part_id: 'triceps', role: 'primary' },
    ]);
  });

  it('makes a link stored without a role primary', async () => {
    await db.run(
      sql`INSERT INTO exercise_body_parts (exercise_id, body_part_id) VALUES ('ex', 'front-delts')`,
    );

    const rows = await db.all<{ role: string }>(
      sql`SELECT role FROM exercise_body_parts WHERE body_part_id = 'front-delts'`,
    );
    expect(rows).toEqual([{ role: 'primary' }]);
  });
});
