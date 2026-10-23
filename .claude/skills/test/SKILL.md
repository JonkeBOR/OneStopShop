---
name: 'test'
description: 'Choose and run the right kind of test in OneStopShop - Vitest unit tests, Playwright end-to-end tests, or the Playwright MCP browser for exploratory checks. Use when writing tests, running tests, or verifying behaviour in a real browser.'
argument-hint: 'Optional: unit | e2e | browse'
user-invocable: true
disable-model-invocation: false
---

# Testing in this repo

Development is test-driven, in two loops - see `docs/architecture/003-development-workflow.md`.
The **inner loop** is Vitest red-green-refactor, run constantly. The **outer loop** is one
Playwright acceptance test per feature, written first, run at the start and end of the feature and
not iterated in.

## Which tool

| Situation                                                      | Tool               |
| -------------------------------------------------------------- | ------------------ |
| Domain logic, validation, data mapping, string modules         | Vitest (inner)     |
| Storage behaviour: atomic writes, immutability, profile scoping | Vitest `storage`   |
| Route handler - import it, call it with `new Request(...)`     | Vitest (inner)     |
| Sync Server Component, Client Component                        | Vitest (inner)     |
| Feature acceptance test, written before the feature            | Playwright (outer) |
| `async` Server Component, real cookies, redirects, navigation  | Playwright (outer) |
| "What is on the page right now", does it look right on a phone | Playwright MCP     |

Default to Vitest. Reach for Playwright only for what Vitest cannot see: `async` Server
Components, real runtime behaviour, and the wiring between them.

Vitest cannot render `async` Server Components. This is a documented Next.js limitation, not a
configuration problem - see `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. It
should rarely bite, because logic does not belong in the async shell: `await` the data and hand it
to a sync component, which Vitest renders fine. **If a business rule can only be tested through
Playwright, the rule is in the wrong place.**

Route handlers are plain functions over Web `Request`/`Response`, so they unit-test in Vitest with
no server. The exception is `next/headers`: `cookies()` is async and reads request scope, so
calling it inside a handler fails under Vitest with `` `cookies` was called outside a request
scope ``. Take the session as a parameter and keep the `next/headers` call in a thin adapter.

Test-first covers logic and contracts. Styling and layout are exempt - check those with the MCP
browser.

The MCP browser is for exploring, not for asserting. When a manual MCP check becomes something you
would repeat, promote it into `e2e/*.spec.ts`.

## Unit tests (Vitest)

Colocated beside the code, `*.test.ts` / `*.test.tsx`. Only `src/**` is collected, so a Playwright
spec is never picked up by Vitest.

    pwsh -NoProfile -File scripts/test.ps1
    npm run test:watch

Import `test` and `expect` from `vitest` explicitly. Globals are off, because enabling them would
need a `types` entry in `tsconfig.json`, and adding one narrows type inclusion from "every
`@types` package" to "only these" - which would silently drop `@types/node` and `@types/react`.

CSS Modules need no configuration. Vitest's `css` option defaults to `false`, which still returns
a proxy for `*.module.css`, so `styles.main` resolves and the component renders.

Assert against `appStrings` rather than a duplicated literal. That keeps tests inside the
no-bare-strings discipline and makes them real regression tests for the strings wiring.

## Storage tests (Vitest, local D1)

Anything that needs a real database to prove - a batch rolling back, a trigger refusing an update, a
query scoped to one profile - goes in `*.storage.test.ts`, which a third Vitest project (`storage`)
runs. Pure rules do not belong here; keep them in `domain/` and test them without a database.

    npx vitest run --project storage src/features/fitness-tracker/server/training

Locally the storage tests run against an in-memory SQLite (`node:sqlite`) behind a D1-shaped
adapter, `sqlite-d1-binding.ts`, so drizzle's D1 driver is used unchanged. Each test file gets its
own database with every migration applied, files run in parallel, and the whole project takes a few
seconds. A running dev server and a second Vitest run do not interfere.

Open the database with `openTestDatabase()` from
`src/features/fitness-tracker/server/storage-test-database.ts` in `beforeAll`. A migration test
that applies migrations itself uses `openEmptyTestDatabase(name)`. Tests in a file share the
database, so they must not depend on rows from other tests: create a fresh profile per test with
`ensureProfile(db, crypto.randomUUID(), now)`. A test that installs a temporary trigger drops it in
`finally`. `storage-test-support.ts` has `expectOk`, `messagesOf` and `rejectionOf`, and
`createProgramFromSpec` for building a program from a short description.

The adapter copies what the code relies on from D1: foreign keys on, `batch` all or nothing, at
most 100 bound parameters per statement, and SQLite's error text. `harness.storage.test.ts` pins
each of these and runs on both backends. See `docs/architecture/010-storage-tests-in-memory.md`.

### On Miniflare's D1

`STORAGE_TEST_BACKEND=d1` runs the same tests against Miniflare's D1 through `getPlatformProxy`,
serially, after a setup that wipes `.wrangler/test-state` and applies the migrations through
wrangler. CI does this on every pull request and before every deploy, and a failure blocks the
merge. Run it locally only to reproduce a CI failure:

    $env:STORAGE_TEST_BACKEND = 'd1'; npx vitest run --project storage; Remove-Item Env:STORAGE_TEST_BACKEND

On Windows this backend leaves one socket in TIME_WAIT for 120 s per query, about 15,000 per run, so
a second run within two minutes fails with `EADDRINUSE`, and a running dev server makes failures
more likely. Wait until `(Get-NetTCPConnection -State TimeWait).Count` is under about 2,000 first,
and never run two Vitest invocations at once on this backend.

For a domain-only feature (constitution 2.1.0) the spec's acceptance scenarios are written first as
tests like these and are the feature's acceptance tests.

## End-to-end tests (Playwright)

`e2e/*.spec.ts`, one project: `mobile-safari`, the `iPhone 17` device profile on WebKit, because
the deployment target is iPhone Safari and nothing else.

    pwsh -NoProfile -File scripts/e2e.ps1
    npm run e2e

Playwright boots `npm run dev` itself and reuses an already-running server on port 3000. The dev
server is deliberate rather than a production build: it keeps one server shared with the MCP loop,
and Server Components still render for real.

The e2e server runs with `GEMINI_API_KEY` blanked so no test calls Google; stop any dev server you
started yourself before `npm run e2e`, because Playwright reuses it with whatever key `.env.local` has.

The first run needs `npm run e2e:install` (WebKit only, ~90 MB). `e2e.ps1` exits 2 with that
instruction if the browser is missing.

The `@/*` alias resolves inside `e2e/`, so import strings from `@/lib/strings/app` as usual.

## Playwright MCP

Configured in `.mcp.json` as mobile WebKit, pinned to `@playwright/mcp@0.0.80`. `--mobile`
emulates iPhone 17 under WebKit, the same viewport the E2E project uses.

The MCP does **not** start the app. The loop is:

1. `npm run dev` in the background (the `run-app` skill).
2. `browser_navigate` to http://localhost:3000.
3. `browser_snapshot` to read the accessibility tree, then `browser_click`, `browser_type`,
   `browser_take_screenshot`.
4. Edit code; Turbopack hot-reloads; re-snapshot. Do not restart the browser or the server.

The MCP pins its own `playwright-core`, which may be a different build from `@playwright/test`. If
it asks for a browser download on first launch, run the command it prints; the two builds coexist
and cost disk, not correctness.
