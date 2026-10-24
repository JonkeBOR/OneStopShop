import 'server-only';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/features/fitness-tracker/server/schema';

export type Database = DrizzleD1Database<typeof schema>;

type D1Binding = { prepare: unknown; batch: unknown };

function isD1Binding(value: unknown): value is D1Binding {
  return typeof value === 'object' && value !== null && 'prepare' in value && 'batch' in value;
}

export function createDatabase(binding: unknown): Database {
  if (!isD1Binding(binding)) {
    throw new Error('The DB binding is missing or is not a D1 database');
  }
  return drizzle(binding, { schema });
}
