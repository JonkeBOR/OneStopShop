# Contract: Data Access Port

**Feature**: [spec.md](../spec.md) | **Date**: 2026-09-10

The storage-agnostic seam FR-026 and FR-027 require. Everything above it speaks application records;
only the adapter beneath it knows a spreadsheet exists.

---

## The port

```ts
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
```

`fromRow` returns `null` rather than throwing, because the owner edits the spreadsheet by hand and a
malformed row is a data condition, not an exception (spec edge case; see
[data-model.md](../data-model.md)).

Two operations. Not four, not a query builder. A third is added when something concretely needs it —
the plan's Complexity Tracking entry rests on keeping this small.

---

## Errors the port may throw

```ts
export class StoreUnavailableError extends Error {}
export class StoreMisconfiguredError extends Error {}
```

A `403` from Sheets is a configuration error, not an authentication one: it almost always means the
spreadsheet was never shared with the service account. Mapping it to a sign-in prompt would send the
owner somewhere that cannot possibly help.

Provider-specific failures are translated at the adapter boundary, so no Google status code, quota
message or spreadsheet identifier travels upward. Route handlers map these to `502` and `500` per
[http-api.md](http-api.md).

| Google response                                                           | Becomes                   |
| ------------------------------------------------------------------------- | ------------------------- |
| `404`, or the named tab is absent                                         | `StoreMisconfiguredError` |
| `429`, `5xx`, network failure, timeout                                    | `StoreUnavailableError`   |
| `401`/`403` — bad service account key, or the sheet is not shared with it | `StoreMisconfiguredError` |

---

## The Google Sheets adapter

`createSheetsCollection` implements `CollectionFactory` against one spreadsheet, mapping each
collection `name` to a tab of that name.

- Read: `GET /v4/spreadsheets/{id}/values/{name}!A2:Z` — row 1 is the header and is skipped.
- Append: `POST /v4/spreadsheets/{id}/values/{name}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`

`valueInputOption=RAW` matters: `USER_ENTERED` would let Sheets reinterpret values — coercing a date
string to a locale-formatted serial, or treating a leading `=` as a formula. Raw values round-trip
unchanged.

The adapter obtains its bearer token from `getStoreAccessToken()`, which signs a service account
assertion and caches the resulting token in memory for its hour (research R5, R12). It never reads
`process.env` itself; configuration arrives from `src/lib/server/env.ts`, keeping to Next's guidance
that only the data access layer touches secrets.

Every module in this layer starts with `import 'server-only'`.

---

## Feature binding

```ts
export const bodyweightCollection = () =>
  createCollection<BodyweightMeasurement>('Bodyweight', bodyweightCodec);
```

The fitness tracker imports this, never the adapter. Replacing Google Sheets means writing one new
`CollectionFactory` and changing where `createCollection` is bound — no feature file changes, which is
the claim FR-027 makes and the reason the seam exists.

---

## Contract tests

Against an in-memory `CollectionFactory` (Vitest):

- `append` then `readAll` returns the record unchanged through the codec — a round-trip property.
- `fromRow` on a blank row, a short row, a row with an unparseable number, and a row with extra
  columns → `null`, and `readAll` omits it without throwing.
- The codec's `header` matches the column order `toRow` produces.

Against the Sheets adapter, with `fetch` stubbed:

- A `404` becomes `StoreMisconfiguredError`; a `429` and a `503` become `StoreUnavailableError`.
- The append request carries `valueInputOption=RAW`.
- No error thrown upward contains the spreadsheet id or the access token.
