import 'server-only';

export type RowCodec<T> = {
  readonly header: readonly string[];
  readonly toRow: (record: T) => readonly string[];
  readonly fromRow: (row: readonly string[]) => T | null;
};

export type Collection<T> = {
  readAll: () => Promise<readonly T[]>;
  append: (record: T) => Promise<void>;
};

export type CollectionFactory = <T>(name: string, codec: RowCodec<T>) => Collection<T>;

export class StoreUnavailableError extends Error {}
export class StoreMisconfiguredError extends Error {}
