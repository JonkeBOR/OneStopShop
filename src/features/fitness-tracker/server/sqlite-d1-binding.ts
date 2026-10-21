import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const maxBoundParameters = 100;

type SqliteD1Result = {
  results: unknown[];
  success: true;
};

export type SqliteD1Statement = {
  bind: (...values: unknown[]) => SqliteD1Statement;
  all: () => Promise<SqliteD1Result>;
  run: () => Promise<SqliteD1Result>;
  first: () => Promise<unknown>;
  raw: () => Promise<unknown[][]>;
  execute: () => SqliteD1Result;
};

export type SqliteD1Binding = {
  prepare: (query: string) => SqliteD1Statement;
  batch: (statements: readonly SqliteD1Statement[]) => Promise<SqliteD1Result[]>;
  exec: (query: string) => Promise<void>;
  close: () => Promise<void>;
};

function settle<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function isRow(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function toSqliteValue(value: unknown): SQLInputValue {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string'
  ) {
    return value;
  }
  throw new TypeError(`D1_TYPE_ERROR: Type '${typeof value}' not supported`);
}

function prepareStatement(
  database: DatabaseSync,
  query: string,
  params: readonly SQLInputValue[],
): SqliteD1Statement {
  const execute = (): SqliteD1Result => ({
    results: database.prepare(query).all(...params),
    success: true,
  });
  return {
    bind: (...values) => {
      if (values.length > maxBoundParameters) {
        throw new Error(
          `too many SQL variables: ${values.length} bound parameters, D1 allows ${maxBoundParameters}`,
        );
      }
      return prepareStatement(database, query, values.map(toSqliteValue));
    },
    all: () => settle(execute),
    run: () => settle(execute),
    first: () => settle(() => execute().results[0] ?? null),
    raw: () =>
      settle(() => {
        const statement = database.prepare(query);
        statement.setReturnArrays(true);
        const rows: unknown[] = statement.all(...params);
        return rows.filter(isRow);
      }),
    execute,
  };
}

export function openSqliteD1Binding(): SqliteD1Binding {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  return {
    prepare: (query) => prepareStatement(database, query, []),
    batch: (statements) =>
      settle(() => {
        database.exec('BEGIN');
        try {
          const results = statements.map((statement) => statement.execute());
          database.exec('COMMIT');
          return results;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }),
    exec: (query) =>
      settle(() => {
        database.exec(query);
      }),
    close: () =>
      settle(() => {
        database.close();
      }),
  };
}
