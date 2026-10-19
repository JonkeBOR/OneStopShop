# 006 — Domain persistence

**Status**: accepted
**Date**: 2026-10-03

## Context

The fitness domain model (feature 002) is the first feature that stores data. Constitution 2.1.0
says Drizzle arrives with the first such feature, and 004 left the layout open: how Drizzle's
migrations meet Wrangler's, how code reaches D1, how multi-row changes stay atomic, and how storage
is tested. This record keeps what outlives the feature, including the places where building it
overturned the plan.

## Decision

### Drizzle writes straight into `migrations/`

`drizzle-orm` 0.45 and `drizzle-kit` 0.31 are the stable lines. 0.31 writes flat `NNNN_name.sql`
files plus a `meta/` folder, and Wrangler applies every `.sql` file in `migrations_dir` that it has
not recorded yet and ignores subfolders, so `drizzle.config.ts` sets `out: './migrations'` and
nothing is copied. 004's worry about a folder per migration applies to the 1.0 beta line only.

The empty baseline `0001_baseline.sql` was deleted. Drizzle starts at `0000`, and a leftover
baseline would have collided with the next file's prefix. The deployed database keeps a row for it
in `d1_migrations`, which is harmless.

`migrations/meta/` is generated and rewritten by every `drizzle-kit generate`, so it is in
`.prettierignore`.

Schema changes always go through `drizzle-kit generate`; generated SQL is never hand-edited. The one
exception is the custom migration for the immutability triggers (`generate --custom`).

`src/features/fitness-tracker/server/schema.ts` does **not** import `server-only`, unlike the other
server modules, because `drizzle-kit` loads it outside Next.js and `server-only` throws there. It
declares tables only; everything that uses it is server-only.

### One module owns the `DB` binding

`src/lib/server/database.ts` exports `createDatabase(binding)` and `getDatabase()`. Every fitness
operation takes `db: Database` as its first parameter and the caller passes `getDatabase()`. That is
003's "keep the edge thin" applied to storage: operations run in Vitest against a real local D1, and
only the one-line adapter needs the OpenNext request context. No repository interface exists and
nothing is mocked.

`src/lib/server/cloudflare-env.d.ts` declares the binding as `unknown`, and `createDatabase` narrows
it with a guard. The obvious alternative, installing `@cloudflare/workers-types` for a typed
`D1Database`, was tried and rejected: the package declares Workers globals that clash with the DOM
types and broke three existing tests' types. `wrangler types` was rejected too, because its output
imports `./.open-next/worker`, which does not exist in CI's typecheck.

### Functional core, imperative shell

`src/features/<feature>/domain/` is pure TypeScript with no I/O and no clock, and holds the rules.
`src/features/<feature>/server/` loads rows with Drizzle, calls the domain, and writes.

Operations return `Result<T, E>` (`domain/result.ts`). Refusals a user can cause are stable string
codes, which the calling feature maps to text in `src/lib/strings/`. Unexpected failures throw. A
refused operation writes nothing. Every profile-scoped query filters by `profileId`, and an
identifier from another profile behaves exactly like a missing one (`not-found`).

### Atomicity is one `db.batch`

D1 has no interactive transactions through the binding. `db.batch([...])` runs its statements as one
implicit transaction and rolls back if one fails. Every multi-row change is a single batch: logging
a set (the set log and the planned set's last weight), finishing a workout with its block or cycle
progression, activation, start over, pause, replacing an exercise, and structural edits. The decision
is computed from rows read just before, so two devices racing could read stale state. That is
accepted for one user, and unique indexes turn the races that matter (one active cycle per program,
one session per workout per block, one weigh-in per day) into clean refusals.

Two D1 limits shaped the code. A statement may bind at most 100 parameters, so bulk inserts are
chunked (`chunkRows` in `server/batch.ts`). And a unique index is checked after every statement,
not at the end of a batch, so renumbering positions first negates them and then writes the final
values.

Atomic rollback is proven by `atomicity.storage.test.ts`, which forces the second statement of a
batch to fail with a temporary trigger.

### Set logs are immutable in the database

Triggers on `set_logs` abort every `UPDATE` and `DELETE` (`migrations/0001_set_log_immutability.sql`).
Context columns on `set_logs` and `workout_sessions` carry no foreign keys, so deleting a program
never touches history. The one foreign key is `exercise_id … ON DELETE RESTRICT`.

### Body parts are a seeded lookup table

`body_parts` holds the 20 muscles of the anatomy chart. Its `id` is the slug the chart uses
(`chest`, `front-delts`, …) and `name` is the display name. It is the one table that is not
profile-scoped. The rows are inserted by a migration (`0007_body_parts_data.sql`), not by the app,
and the ids are the closed `BodyPart` union in `domain/body-part.ts`, which the schema uses as the
column's enum. `exercise_body_parts` links an exercise to its muscles with the primary key
`(exercise_id, body_part_id)`. It cascades when an exercise is deleted and restricts deleting a body
part. A per-link score (bench press: chest 10, front delts 5) would be a column on that row.

### Storage is tested against a real local D1

A third Vitest project, `storage`, runs `src/**/*.storage.test.ts`. A `globalSetup`
(`vitest.storage-setup.ts`) wipes `.wrangler/test-state`, applies the migrations with
`wrangler d1 migrations apply --local --persist-to`, and the tests open the same files through
Wrangler's `getPlatformProxy({ persist: { path: '.wrangler/test-state/v3' } })`. Tests isolate by
creating a fresh profile, since every row is profile-scoped.

The project runs with `isolate: false` and `maxWorkers: 1`, and `storage-test-database.ts` opens the
connection lazily once and shares it across every file. That avoided starting `workerd` per file:
the storage project went from about 44 s to about 32 s. The `workerd` process is disposed when the
worker's event loop drains, and none was left running after a run. Vitest also requires
`sequence: { groupOrder: 1 }` on the project, because projects with a different `maxWorkers` must
have a unique group order.

Shared mutable state means tests must not depend on each other's rows. A test that installs a
temporary trigger removes it in `finally`.

### Measured

| Check                                     | Result                                    |
| ----------------------------------------- | ----------------------------------------- |
| SC-005 open a 10×10×10×10 session         | under 1 s (asserted in the test)          |
| SC-006 100,000-log history, grouped       | under 2 s (asserted in the test)          |
| Whole `check.ps1`                         | about 43 s, 266 tests                     |
| Test stage of `check.ps1`                 | about 33 s (about 1 s before)             |
| Storage project alone                     | about 32 s (was about 44 s per-file)      |
| Worker size (`wrangler deploy --dry-run`) | 1,103 KiB gzip, about 1.08 MiB, unchanged |

The plan budgeted under 10 s added to the gate and **missed it**. The time is fixture building
(`cycles`, `training` and `history` tests build programs through the operations) plus about 9 s for
the performance file. Moving `performance.storage.test.ts` out of the gate into its own script would
recover about a quarter of it; that was left as a decision for the owner.

### Dependencies

`drizzle-kit` brings `esbuild` 0.18, 0.25 and 0.28 and their platform binaries, so the lockfile grew
by several thousand lines. `esbuild@0.28`'s install script is blocked by npm and was deliberately
**not** approved: `drizzle-kit generate` works without it. Re-check if a `drizzle-kit` upgrade starts
to need it.

## Consequences

- 007 changed the cycle described here: a program now has one cycle for its whole life instead of one
  per pass, and sessions refer to blocks by identity. See
  [007-cycle-as-container-and-bff.md](007-cycle-as-container-and-bff.md).
- A later feature adds its tables to its own `server/schema.ts` and re-exports them where
  `src/lib/server/database.ts` builds the schema. Today that file imports the fitness schema
  directly, which is the point to generalise when a second feature stores data.
- `scripts/test.ps1` used to report `SKIP` with exit 0 when Vitest crashed before running any test.
  It now reports `ERROR` and exits 2 in that case. This was found when a project configuration
  mistake made the whole run execute no tests while the gate still passed.
- One run of the gate hung once, with `workerd` alive and no CPU use, and could not be reproduced in
  five later runs. If it recurs, suspect two Vitest runs overlapping on `.wrangler/test-state`,
  because `globalSetup` wipes it at the start of every run.
