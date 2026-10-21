# 010 — Storage tests on an in-memory SQLite, D1 in CI

**Status**: accepted
**Date**: 2026-10-21

## Context

[006](006-domain-persistence.md) runs the `storage` Vitest project against a local D1 through
Wrangler's `getPlatformProxy`. That reaches D1 over HTTP to a local workerd, and Miniflare closes
the connection after every request (undici's `reset` flag in `dispatchFetch`, deliberately, to
avoid keep-alive races). Every awaited query therefore leaves one loopback socket in TIME_WAIT for
120 seconds, against Windows' default range of 16,384 ephemeral ports.

At 290 storage tests one run left about 15,000 such sockets. A second run within two minutes failed
more than half the storage tests with `EADDRINUSE`, a running dev server made failures more likely,
and each gate run after the first paid a wait of about two minutes for ports. The tests also ran one
at a time on one shared connection. Agents run the gate after every plan step, so this became the
main cost of implementation.

`@cloudflare/vitest-pool-workers` would run D1 in process, but it needs Vitest 4 and this repo is
on Vitest 5.

## Decision

### Locally, an in-memory SQLite behind a D1-shaped adapter

`src/features/fitness-tracker/server/sqlite-d1-binding.ts` wraps a `DatabaseSync` from
`node:sqlite`, built into Node 24, and exposes the part of the D1 binding that drizzle's D1 driver
calls: `prepare`, `bind`, `all`, `run`, `raw`, `first` and `batch`. `createDatabase` and the driver
are used unchanged, so the operations under test run the same code path as in the Worker.

`openTestDatabase()` gives each test file its own `:memory:` database with every file in
`migrations/` applied in filename order. `openEmptyTestDatabase(name)` gives the migration tests an
empty one. Files run in parallel with Vitest's defaults; there is no global setup and no state on
disk.

The adapter copies only what the code relies on:

- foreign keys are enforced;
- `batch` is all or nothing (`BEGIN`, then `COMMIT`, or `ROLLBACK` and rethrow);
- a statement with more than 100 bound parameters is refused, which is why `chunkRows` exists;
- errors keep SQLite's text, which `isUniqueConstraintViolation` and `messagesOf` read.

`harness.storage.test.ts` pins each of these and passes on both backends.

### In CI, the same tests on Miniflare's D1

`STORAGE_TEST_BACKEND=d1` selects the 006 setup: `getPlatformProxy`, the wrangler-applied
migrations and serial running. `.github/workflows/check.yml` runs the gate this way on every pull
request into `main`, and `deploy.yml` does the same before migrating and deploying. The PR check is a
required status check in the "Protect main" ruleset, so a query that works on SQLite but fails on D1
blocks the merge. On Linux the sockets are reused, so the port problem does not arise there.

## Consequences

- A local storage run takes seconds and opens no sockets. It can run back to back, in parallel with
  another Vitest run, and while the dev server is up.
- A difference between `node:sqlite` and D1 that the adapter does not copy shows up in CI rather
  than locally. Covering it needs no extra tests, because every existing storage test runs on D1
  there.
- The performance tests (SC-005, SC-006) measure in-process SQLite locally, which has no network
  between the code and the database, so their thresholds are easier to meet. CI still asserts them
  on D1.
- `STORAGE_TEST_BACKEND=d1` runs locally for reproducing a CI failure, with the old port limits.

## Measured

On the development machine (Windows 11, 20 logical CPUs) on 2026-10-21, before and after this
change, with the same 290 storage tests and 4 added harness tests.

| Check                                   | Before (D1)                    | After (SQLite)        |
| --------------------------------------- | ------------------------------ | --------------------- |
| Storage project alone                   | 88.3 s                         | 3.6 s                 |
| TIME_WAIT sockets added by that run     | about 15,300                   | 0                     |
| Immediate second storage run            | 171 of 290 failed (EADDRINUSE) | 294 passed, 3.5 s     |
| Wait for free ports before the next run | 107 s                          | none                  |
| Whole `check.ps1`                       | 138.6 s                        | 22.9 s                |
| Whole `check.ps1` with the dev server up | not attempted (known to fail) | 22.9 s, 948 passed    |
| Storage project on D1 (`d1` backend)    | 88.3 s                         | 79.6 s, 294 passed    |
