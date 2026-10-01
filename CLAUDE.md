# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BoombasticTracker is a personal **Next.js / React / TypeScript** web app and PWA, installed on the
developer's iPhone Home Screen. Fitness tracking — strength training and bodyweight metrics, and
trends derived from historical data — is its first feature, not the whole product. Keep routes,
folders and shared code feature-agnostic unless something genuinely belongs to one feature.

- Persistence is a **Google Sheet** via the Google Sheets API, accessed **only** server-side.
- Next.js also acts as the **BFF**: the browser calls `/api/*`, never Google.
- Auth is **Google OAuth**, exchanged for a separate long-lived application session cookie.
- Hosting must stay within a genuinely **free tier**.

The binding principles are in [constitution.md](.specify/memory/constitution.md) — Simplicity First
is non-negotiable. Cross-cutting architecture decisions are recorded in
[docs/architecture/](docs/architecture/).

## Project state

The app foundation feature (`specs/001-app-foundation/`) is implemented. Google OAuth sign-in
(authorization code + PKCE, identity only) establishes an encrypted, `HttpOnly` application session
cookie in `src/lib/server/session.ts`; `src/proxy.ts` gives signed-out visitors a coarse redirect to
`/sign-in`, and `src/lib/server/current-user.ts`'s `requireOwner()` /
`requireOwnerFromRequest()` is the real authorization gate every Server Component read and route
handler calls. The spreadsheet is reached independently, as a Google **service account**
(`src/lib/server/store-access-token.ts`, `src/lib/server/sheets-collection.ts`), through the
storage-agnostic `Collection<T>` port in `src/lib/server/collection.ts` — no Google credential of
any kind reaches the browser.

`src/lib/features.ts` is the landing-page feature registry (one entry today, `fitness-tracker`),
rendered by `src/components/feature-card/FeatureCard.tsx`. `src/features/fitness-tracker/` holds
that feature's domain type and validation (`bodyweight.ts`), its store binding
(`bodyweight-store.ts`), and its two components — `BodyweightHistory` (server-rendered) and
`BodyweightForm` (the only `'use client'` leaf in the app). `src/app/api/auth/` and
`src/app/api/bodyweight/route.ts` are the route handlers; every one of them is a plain function over
Web `Request`/`Response` so it unit-tests in Vitest without a server, per
[003-development-workflow.md](docs/architecture/003-development-workflow.md).

Design tokens live in `src/app/globals.css`, CSS Modules sit beside the code that uses them, and
user-facing text is in `src/lib/strings/`. `src/instrumentation.ts` monkey-patches `global.fetch` to
stub Google's token/Sheets endpoints, but only when `E2E_STUB_GOOGLE_SHEETS=1` — set by Playwright's
`webServer`, so `e2e/bodyweight.spec.ts` needs no live spreadsheet and production code is untouched.

Testing: Vitest for unit tests colocated as `src/**/*.test.ts(x)`, one Playwright acceptance spec
per user story in `e2e/` (`sign-in`, `landing-navigation`, `bodyweight`), and a Playwright MCP
browser configured in `.mcp.json`.

Not built yet: CI, and a chosen hosting provider (see `docs/architecture/` once decided — it is the
blocker for closing research.md's R9, the open question about OAuth redirects from an installed,
standalone iPhone PWA, which needs a real device against a real HTTPS origin and cannot be closed
from this environment). `.env.local` needs real Google credentials before sign-in or the spreadsheet
will work for real; see `README.md`.

## Commands

    pwsh -NoProfile -File scripts/check.ps1        # format + lint + typecheck + unit tests
    pwsh -NoProfile -File scripts/check.ps1 -Fix   # fix what can be fixed, then report

Exit codes: `0` passed or nothing to check, `1` issues found, `2` the check could not run.

**Finish every code change with `scripts/check.ps1` exiting 0.**

Development is test-driven: a Vitest red-green-refactor inner loop, and one Playwright acceptance
test per feature written first. See
[003-development-workflow.md](docs/architecture/003-development-workflow.md).

`next lint` no longer exists in Next 16; ESLint runs through `scripts/lint.ps1` or `npm run lint`.

Requires Node.js >= 22.12 and PowerShell 7 (`pwsh`); run `npm install` first, and
`npm run e2e:install` before the first end-to-end run.

Detail lives in skills rather than here, so it loads only when it is needed:

- **check** — every script, switch, exit code and output shape.
- **run-app** — running, building and LAN-exposing the app, and iPhone Safari testing.
- **test** — choosing between Vitest, Playwright and the browser MCP.

## Guidelines

Read these before writing code. They are enforced by ESLint where enforceable. The tooling
reference that used to sit at `02` is now the `check` skill.

- [01-general-guidelines.md](docs/01-general-guidelines.md) — no comments, no inline CSS, no bare
  strings in markup.
- [03-typescript.md](docs/03-typescript.md) — strictness, no `any`, naming, module boundaries.
- [04-react-and-nextjs.md](docs/04-react-and-nextjs.md) — Server vs Client Components, data access,
  route handlers, folder structure.
- [05-styling-and-strings.md](docs/05-styling-and-strings.md) — CSS Modules, design tokens, string
  constants.

Two rules deserve emphasis because they are unusual and are hard errors:

- **Never add comments.** Encode intent in names and structure instead.
- **Never put a bare string in JSX.** `react/jsx-no-literals` rejects `<h1>Workouts</h1>` and
  `<h1>{'Workouts'}</h1>`; text comes from a constants module. Props are exempt.

"Never add comments" is not enforceable by any off-the-shelf ESLint rule, so it is the one
guideline a review has to catch by reading.

## Working in this repo

- Check what exists before assuming structure — most of the app is still unwritten.
- New architecture or hosting decisions belong in `docs/architecture/`, and any stack change must
  also be reflected in the constitution.
- Don't add a dependency, abstraction or service without a concrete present need.
- `src/app/page.tsx` with `src/app/page.module.css` and `src/lib/strings/app.ts` is the worked
  example of the conventions stack — Server Component, CSS Module, design tokens, no bare strings.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
