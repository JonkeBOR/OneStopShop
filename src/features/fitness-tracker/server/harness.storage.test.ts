import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isUniqueConstraintViolation } from './batch';
import { exercises, profiles } from './schema';
import { openTestDatabase, type TestDatabase } from './storage-test-database';
import { messagesOf, rejectionOf } from './storage-test-support';

const expectedTables = [
  'bodyweight_entries',
  'cycles',
  'exercise_slots',
  'exercises',
  'planned_sets',
  'profiles',
  'programs',
  'set_logs',
  'training_blocks',
  'workout_sessions',
  'workouts',
];

const expectedTriggers = ['set_logs_no_delete', 'set_logs_no_update'];

describe('storage harness', () => {
  let testDatabase: TestDatabase;
  const now = new Date('2026-10-21T10:00:00Z');

  beforeAll(async () => {
    testDatabase = await openTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('opens a local D1 with every migration applied', async () => {
    const rows = await testDatabase.db.all<{ type: string; name: string }>(
      sql`SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name`,
    );
    const names = (type: string) => rows.filter((row) => row.type === type).map((row) => row.name);

    expect(names('table')).toEqual(expect.arrayContaining(expectedTables));
    expect(names('trigger')).toEqual(expectedTriggers);
  });

  it('refuses a row that points at a missing parent', async () => {
    const id = crypto.randomUUID();
    const error = await rejectionOf(() =>
      testDatabase.db
        .insert(exercises)
        .values({ id, profileId: crypto.randomUUID(), name: id, nameKey: id, createdAt: now }),
    );

    expect(messagesOf(error)).toContain('FOREIGN KEY constraint failed');
  });

  it('writes nothing from a batch when one of its statements fails', async () => {
    const { db } = testDatabase;
    const profileId = crypto.randomUUID();
    const exerciseId = crypto.randomUUID();

    const error = await rejectionOf(() =>
      db.batch([
        db.insert(profiles).values({ id: profileId, accountSubject: profileId, createdAt: now }),
        db.insert(exercises).values({
          id: exerciseId,
          profileId: crypto.randomUUID(),
          name: exerciseId,
          nameKey: exerciseId,
          createdAt: now,
        }),
      ]),
    );

    expect(error).toBeInstanceOf(Error);
    expect(await db.select().from(profiles).where(eq(profiles.id, profileId))).toEqual([]);
  });

  it('binds up to 100 parameters in one statement and refuses more', async () => {
    const { db } = testDatabase;
    const selectOf = (count: number) =>
      sql`SELECT ${sql.join(
        Array.from({ length: count }, (_, index) => sql`${index}`),
        sql`, `,
      )}`;

    await expect(db.all(selectOf(100))).resolves.toHaveLength(1);
    expect(messagesOf(await rejectionOf(() => db.all(selectOf(101))))).toContain(
      'too many SQL variables',
    );
  });

  it('reports a duplicate as a unique constraint violation', async () => {
    const { db } = testDatabase;
    const accountSubject = crypto.randomUUID();
    await db.insert(profiles).values({ id: crypto.randomUUID(), accountSubject, createdAt: now });

    const error = await rejectionOf(() =>
      db.insert(profiles).values({ id: crypto.randomUUID(), accountSubject, createdAt: now }),
    );

    expect(isUniqueConstraintViolation(error)).toBe(true);
  });
});
