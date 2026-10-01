# Implementation Plan: Personal App Foundation (Fitness Tracker as First Feature)

**Branch**: `feat/initial-architecture` (spec directory `001-app-foundation`) | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-app-foundation/spec.md`

## Summary

Turn the existing static landing page into an authenticated personal app: Google OAuth sign-in that
establishes an encrypted, `HttpOnly` application session cookie; a landing page driven by a feature
registry whose single entry routes to `/fitness-tracker`; and a bodyweight record that travels from a
form, through a route handler, through a provider-agnostic data-access port, to a Google Sheet — and
back.

**The two Google credentials are separate, and that separation is the load-bearing decision.** Sign-in
uses the authorization code grant with PKCE, scoped to `openid email`, purely to learn who the owner
is; nothing it returns is stored. Spreadsheet access uses a **service account** via the JWT bearer
assertion grant (RFC 7523) — the application authenticating as itself, independent of whether anyone
is signed in. So the session cookie holds an email and no Google credential at all, and the store
credential never touches the browser.

The technical approach is deliberately dependency-light. The OAuth flow is two `fetch` calls against
documented endpoints, the assertion exchange is a third, and Sheets access is two more. The one
runtime dependency added is `jose`: it seals the session, verifies Google's ID token, and signs the
service account assertion. No auth framework, no Google SDK, no validation library — each was
evaluated and rejected in [research.md](research.md) against a concrete size or complexity cost.

One Phase 0 finding changes the framework surface: `middleware.ts` is **deprecated in Next 16** and
renamed to `proxy.ts`, so the coarse route guard uses the new convention.

A second finding drove the credential split above. A Google OAuth app left in **"Testing" publishing
status issues refresh tokens that expire after 7 days**, which would have broken SC-001's 30-day
no-sign-in requirement a week after the app appeared to work. Rather than work around it by publishing
the app and keeping the owner's credentials on the data path, the service account removes the need for
a refresh token entirely — and with it a sensitive scope, an unverified-app warning, and a token
refresh mechanism that collided with Next's rule against setting cookies from a Server Component. See
[research.md](research.md) R5, R6 and R12.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict, plus `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Node.js >= 22.12

**Primary Dependencies**: Next.js 16.3.4 (App Router), React 19.3. Added: `jose` 6.x (session encryption, ID token verification, RS256 signing of the service account assertion), `server-only` 0.0.1 (build-time client-import guard). No auth framework, no Google client library, no validation library — see [research.md](research.md) R2, R4, R8, R12.

**Storage**: One Google Sheet, reached only server-side through the Sheets REST API v4 (`values.get`, `values.append`), behind a `Collection` port. See [contracts/data-access.md](contracts/data-access.md) and [contracts/sheet-layout.md](contracts/sheet-layout.md).

**Testing**: Vitest for pure functions, sync components, and route handlers (plain functions over Web `Request`/`Response`); Playwright mobile WebKit for `async` Server Components and full journeys. Per [002-testing-strategy.md](../../docs/architecture/002-testing-strategy.md) and [003-development-workflow.md](../../docs/architecture/003-development-workflow.md): one acceptance test per user story, written first.

**Target Platform**: iPhone Safari, installed to the Home Screen in standalone mode. Desktop browsers work but are not the design target.

**Project Type**: Single full-stack Next.js application — UI and BFF in one build, one deployment.

**Performance Goals**: Interaction-latency-bound, not throughput-bound. A data read or write should complete within the 5 seconds SC-005 allows, over mobile network, including one Google round trip.

**Constraints**: Single user. Free-tier hosting only. No Google credential may reach client-accessible storage or any client-readable payload (FR-006 to FR-009). Session survives 30 days without interactive sign-in (SC-001). No offline support.

**Scale/Scope**: One user, one spreadsheet, one feature, roughly 4 route handlers and 4 pages. Data volume measured in hundreds of rows over years.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Status                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Simplicity First** (NON-NEGOTIABLE) | PASS with one tracked deviation                   | Two runtime dependencies added, each against a concrete need: `jose` (encryption and JWT verification are not things to hand-roll) and `server-only` (build-time enforcement of a hard security requirement). Auth.js, `googleapis` (213 MB unpacked), `@googleapis/sheets`, `google-auth-library` and `zod` were each evaluated and rejected. The data-access port is the tracked deviation — see Complexity Tracking.                                                                                                                                                                   |
| **II. Server-Mediated Data Access**      | PASS                                              | The browser calls `/api/bodyweight` only. Sheets access is confined to `src/lib/server/`, every module there marked `import 'server-only'`. Endpoints speak measurements, never ranges or row numbers (FR-028).                                                                                                                                                                                                                                                                                                                                                                           |
| **III. Session/Identity Separation**     | PASS, and more cleanly than the principle demands | Google authorization and the app session are separate concerns in separate modules (`google-oauth.ts`, `session.ts`), and the separation now runs deeper than module boundaries: the session payload contains no Google credential at all, because store access uses the application's own service account. The browser holds one opaque encrypted cookie — `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age` — carrying an email. The principle's requirement that the Google access token stay out of client storage is satisfied by there being no such token to store. |
| **IV. Free-Tier Hosting Constraint**     | PASS                                              | No infrastructure added. No database, no session store, no queue — the session is stateless by design precisely so no server-side store is needed. Provider stays undecided; the trigger to decide it is the on-device HTTPS test.                                                                                                                                                                                                                                                                                                                                                        |
| **V. Self-Documenting Code**             | PASS                                              | No comments. CSS Modules beside components. All user-facing text through `src/lib/strings/`. Enforced by `scripts/check.ps1`, except the comment rule, which review must catch by reading.                                                                                                                                                                                                                                                                                                                                                                                                |

**Gate result: PASS.** One deviation recorded in Complexity Tracking; no unresolved `NEEDS CLARIFICATION`.

### Post-Design Re-Check

Re-evaluated after Phase 1. Still PASS, with two design decisions worth naming:

- **The port stayed narrow.** `Collection<T>` has two operations, `readAll` and `append`. Resisting a query/filter API keeps the abstraction honest — Simplicity First is about not building the general case before it exists.
- **`proxy.ts` is a convenience, not the gate.** Next's own data-security guidance is that a proxy check is not a security boundary. The real check runs in `requireOwner()` inside the data access layer, on every read and every write. The proxy exists so a signed-out visitor gets a clean redirect instead of an error page. Both are cheap; only one is load-bearing.

## Project Structure

### Documentation (this feature)

```text
specs/001-app-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output — 11 decisions, alternatives, one open risk
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/           # Phase 1 output
│   ├── http-api.md      #   what the browser may call
│   ├── data-access.md   #   the storage-agnostic port
│   └── sheet-layout.md  #   the Google Sheet the adapter expects
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── proxy.ts                              coarse signed-out redirect (NOT middleware.ts — deprecated in Next 16)
├── app/
│   ├── layout.tsx                        existing
│   ├── page.tsx                          landing page, renders the feature registry
│   ├── page.module.css                   existing
│   ├── not-found.tsx                     FR-023
│   ├── manifest.ts                       existing
│   ├── sign-in/
│   │   ├── page.tsx                      sign-in prompt and error states
│   │   └── page.module.css
│   ├── fitness-tracker/
│   │   ├── page.tsx                      Server Component; reads through the DAL directly
│   │   └── page.module.css
│   └── api/
│       ├── auth/
│       │   ├── google/start/route.ts     builds the Google consent URL, sets state + PKCE cookies
│       │   ├── google/callback/route.ts  verifies state, exchanges code, checks allowlist, sets session
│       │   └── sign-out/route.ts         clears the session cookie
│       └── bodyweight/route.ts           GET history, POST a measurement
├── components/
│   └── feature-card/                     shared landing-page card
├── features/
│   └── fitness-tracker/
│       ├── bodyweight-form.tsx           'use client' leaf — the only client component
│       ├── bodyweight-history.tsx        server-rendered list
│       ├── bodyweight.ts                 domain type, parsing, validation rules
│       └── bodyweight-store.ts           binds the shared Collection port to this feature
├── lib/
│   ├── features.ts                       the feature registry — one entry today
│   ├── server/
│   │   ├── session.ts                    JWE seal/unseal, cookie read/write/clear
│   │   ├── google-oauth.ts               auth URL, code exchange, ID token verification (identity only)
│   │   ├── current-user.ts               cache()d session resolution + allowlist check
│   │   ├── store-access-token.ts         signs the service account assertion, caches the token for its hour
│   │   ├── sheets-collection.ts          the Sheets adapter for Collection<T>
│   │   ├── collection.ts                 the storage-agnostic port
│   │   └── env.ts                        the only module that reads process.env
│   └── strings/
│       ├── app.ts                        existing
│       ├── auth.ts
│       └── fitness-tracker.ts
└── e2e/                                  (repo root) one acceptance spec per user story
```

**Structure Decision**: The layout in [04-react-and-nextjs.md](../../docs/04-react-and-nextjs.md) is followed
exactly, because it already prescribes this structure and names `lib/server/` for the Sheets, session
and Google auth modules. Nothing in it is invented here.

The FR-020 promise — add a feature without touching existing ones — is carried by `src/lib/features.ts`.
The landing page renders whatever that registry holds; a second feature is a new `app/<feature>/` folder,
a new `features/<feature>/` folder, and one more entry in the registry. No fitness tracker file is
touched. `src/lib/server/` and `src/components/` hold only what more than one feature could use.

## Complexity Tracking

> Filled because the Constitution Check records one deviation.

| Violation                                                                                                                                                             | Why Needed                                                                                                                                                                                    | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A storage-agnostic `Collection<T>` port with a Sheets adapter, when only one provider exists — Principle I warns against exactly this kind of speculative abstraction | FR-026 and FR-027 require it explicitly, and the owner's input named "easy future replacement of the persistence layer" as a guiding principle. It is a stated requirement, not an inference. | Calling the Sheets API directly from feature code was rejected because it would spread `spreadsheetId`, A1 ranges and row shapes across every future feature, which is the specific outcome FR-027 exists to prevent. The cost is held down by keeping the port to two operations, `readAll` and `append`, and adding a third only when something actually needs it. |

## Phase Outputs

- **Phase 0** — [research.md](research.md): 11 decisions with rationale and rejected alternatives; one
  open risk (iOS standalone OAuth redirect) carrying a concrete on-device verification task rather
  than an assumption.
- **Phase 1** — [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

Phase 2 (`tasks.md`) is produced by `/speckit-tasks`, not by this command.
