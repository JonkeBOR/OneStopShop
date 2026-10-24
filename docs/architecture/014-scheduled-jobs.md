# 014 — Scheduled jobs

**Status**: accepted
**Date**: 2026-10-24

## Context

The app is one OpenNext Worker that only answers requests. Some work belongs off the request path:
the first case is asking Gemini for a week of affirmations, which can take minutes on a busy free
tier and must be retried, while a page render has no room for either (see
[015](015-weekly-affirmation-categories.md)). Cloudflare Cron Triggers run a Worker's `scheduled`
handler on a schedule, on the free plan, with up to 15 minutes of wall time per run. Time spent
waiting on `fetch` does not count towards the 10 ms CPU limit.

## Decision

### One separate jobs Worker, with no HTTP surface

Scheduled jobs run in **`onestopshop-jobs`**, a plain Worker configured by `jobs/wrangler.jsonc`.
No Next and no OpenNext. It has no `fetch` handler, no `routes`, `workers_dev: false` and
`preview_urls: false`, so it has no URL and only its cron can start it. No endpoint can trigger a
job. The app Worker stays as it was, and the constitution's single-Worker rule for pages and server
still holds.

### Shared D1, migrations owned by the root config

Both Workers bind the same D1 database as `DB`, with the same `database_id`. `jobs/wrangler.jsonc`
has no `migrations_dir`. Migrations stay owned by the root `wrangler.jsonc` and run once, in CI,
before either Worker deploys.

### Jobs are plain functions, and `jobs/` is only the adapter

A job is a platform-agnostic function that lives with its feature, e.g.
`src/features/fitness-tracker/jobs/weekly-affirmations.ts`. It takes its database, generator,
clock and sleep as arguments, so storage tests run it without Cloudflare, Google or real waits.

`jobs/` holds two files:

- `worker.ts` is the Cloudflare adapter. Its `scheduled` handler takes the time from
  `controller.scheduledTime`, not `new Date()`, and runs the cron's jobs inside `ctx.waitUntil`.
- `schedules.ts` holds `jobsBySchedule`, a map from cron string to jobs. Each `ScheduledJob`
  builds its dependencies from the Worker's `env` and calls the job function. `runAll` runs the
  jobs one after another, logs each failure by job name and carries on, and an unknown cron logs a
  warning.

A move off Workers replaces `jobs/worker.ts` and nothing else. A Vitest test checks that the crons
in `jobs/wrangler.jsonc` match the keys of `jobsBySchedule` exactly.

### One cron per schedule, never per job

The free plan allows **5 cron triggers per account**. A cron is added per distinct schedule, and a
future job that needs a daily run joins `0 3 * * *`.

### Bundling outside Next

Wrangler bundles `jobs/worker.ts` with esbuild and resolves the `@/` paths from `tsconfig.json`.
`server-only` throws outside Next's server build, so `jobs/wrangler.jsonc` aliases it to its empty
module. `createDatabase` and `Database` live in `src/lib/server/create-database.ts`, apart from
`getDatabase` in `database.ts`, which imports OpenNext. The Gemini client in `src/lib/gemini/` takes
its config as an argument and never reads `process.env`.

A dry run alone doesn't catch an accidental OpenNext import: it bundles fine and only throws at run
time. So `scripts/jobs-bundle.ps1`, part of `scripts/check.ps1`, runs
`wrangler deploy --dry-run -c jobs/wrangler.jsonc` with an esbuild metafile and fails on any input
from `@opennextjs` or `next`.

The Worker's types are declared by hand (`JobsEnv`, and a minimal `ScheduledController` and
`ExecutionContext`), because `@cloudflare/workers-types` is not installed and its globals clash with
the DOM lib the app's `tsconfig.json` uses.

### Deploy order

`.github/workflows/deploy.yml`:

1. Run the gate.
2. Apply the D1 migrations once, with the root config.
3. Build and deploy the app Worker.
4. Run `wrangler deploy -c jobs/wrangler.jsonc` with the same `CLOUDFLARE_API_TOKEN`.

A job's secrets are set with `wrangler secret put … -c jobs/wrangler.jsonc`, after the jobs Worker
has been deployed once.

### Local testing

    npx wrangler dev -c jobs/wrangler.jsonc --test-scheduled --persist-to .wrangler/state
    curl.exe "http://localhost:8787/__scheduled?cron=0+3+*+*+*"

`--persist-to .wrangler/state` points the jobs Worker at the same local database as `next dev`.
`jobs/.dev.vars` is gitignored by the existing `.dev.vars` pattern.

## Consequences

- Off-request work has a home without a second hosting platform or a paid plan.
- Two Workers deploy on every merge. Migrations still run once, before both.
- A job can be tested end to end with in-memory SQLite and injected fakes. Only the adapter and the
  cron wiring are left to a local `wrangler dev` run.
- The jobs Worker logs go to Cloudflare's Worker logs, not to the app's.
