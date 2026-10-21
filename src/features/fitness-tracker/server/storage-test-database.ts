import { readdir, readFile, rm } from 'node:fs/promises';
import { createDatabase, type Database } from '@/lib/server/database';
import { openSqliteD1Binding } from './sqlite-d1-binding';

export type TestDatabase = {
  db: Database;
  dispose: () => Promise<void>;
};

const storageOnMiniflare = process.env.STORAGE_TEST_BACKEND === 'd1';
const migrationsDirectory = 'migrations';
const miniflareStateDirectory = '.wrangler/test-state';

let sharedMiniflare: Promise<TestDatabase> | undefined;

async function openMiniflare(persistPath: string): Promise<TestDatabase> {
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<{ DB: unknown }>({ persist: { path: persistPath } });
  return { db: createDatabase(proxy.env.DB), dispose: () => proxy.dispose() };
}

async function openSharedMiniflare(): Promise<TestDatabase> {
  const connection = await openMiniflare(`${miniflareStateDirectory}/v3`);
  process.once('beforeExit', () => {
    sharedMiniflare = undefined;
    void connection.dispose();
  });
  return connection;
}

async function openSqlite({ migrated }: { migrated: boolean }): Promise<TestDatabase> {
  const binding = openSqliteD1Binding();
  if (migrated) {
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql'));
    for (const file of files.toSorted()) {
      await binding.exec(await readFile(`${migrationsDirectory}/${file}`, 'utf-8'));
    }
  }
  return { db: createDatabase(binding), dispose: binding.close };
}

export async function openTestDatabase(): Promise<TestDatabase> {
  if (storageOnMiniflare) {
    sharedMiniflare ??= openSharedMiniflare();
    const connection = await sharedMiniflare;
    return { db: connection.db, dispose: () => Promise.resolve() };
  }
  return openSqlite({ migrated: true });
}

export async function openEmptyTestDatabase(name: string): Promise<TestDatabase> {
  if (!storageOnMiniflare) {
    return openSqlite({ migrated: false });
  }
  const persistPath = `${miniflareStateDirectory}/${name}`;
  await rm(persistPath, { recursive: true, force: true });
  return openMiniflare(persistPath);
}
