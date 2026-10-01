---
description: 'Task list for Personal App Foundation (Fitness Tracker as First Feature)'
---

# Tasks: Personal App Foundation (Fitness Tracker as First Feature)

**Input**: Design documents from `/specs/001-app-foundation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included and mandatory. [003-development-workflow.md](../../docs/architecture/003-development-workflow.md) adopts TDD for this repository: one Playwright acceptance test per user story written **first**, then a Vitest red-green-refactor inner loop. Every test task below precedes the code it covers.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Exact file paths are given in every task

## Path Conventions

Single full-stack Next.js app. Source under `src/`, colocated Vitest specs as `src/**/*.test.ts(x)`,
Playwright specs in `e2e/`. Paths follow the Structure Decision in [plan.md](plan.md).

## Standing rules for every task

These come from the repository guidelines and apply everywhere; they are not repeated per task.

- **No comments.** Intent goes in names and structure ([01-general-guidelines.md](../../docs/01-general-guidelines.md)).
- **No bare strings in JSX.** Text comes from `src/lib/strings/` — `react/jsx-no-literals` is a hard error.
- **No inline styles.** CSS Modules beside the component.
- **No `any`.** External data arrives as `unknown` and is narrowed ([03-typescript.md](../../docs/03-typescript.md)).
- **Every module under `src/lib/server/` begins with `import 'server-only'`.**
- **Finish each task with `pwsh -NoProfile -File scripts/check.ps1` exiting 0.**

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and configuration scaffolding

- [x] T001 Add `jose` and `server-only` to dependencies in `package.json`, then run `npm install`
- [x] T002 [P] Create `.env.example` at repo root listing all eight variables with a one-line purpose each: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `ALLOWED_GOOGLE_EMAIL`, `APP_TIME_ZONE` — placeholder values only, never real credentials
- [x] T003 [P] Confirm `.gitignore` at repo root ignores `.env*.local` and any `*.json` service account key, adding the patterns if absent

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The configuration layer every later module reads. Deliberately thin — the auth and data
infrastructure belong to the stories that deliver them, not to a speculative shared phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Write failing unit tests in `src/lib/server/env.test.ts`: a missing variable throws an error naming that variable; a `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` containing literal `\n` sequences is converted to real newlines; a malformed PEM throws at load rather than at first use; `APP_TIME_ZONE` rejects a non-IANA value
- [x] T005 Implement `src/lib/server/env.ts` starting with `import 'server-only'` — the only module in the codebase that reads `process.env`, exporting a typed, validated config object and failing at startup with a message naming any missing or malformed variable

**Checkpoint**: Configuration is typed and validated — user story implementation can begin

---

## Phase 3: User Story 1 - Sign in once and stay signed in (Priority: P1) 🎯 MVP

**Goal**: Google OAuth sign-in establishing an encrypted application session cookie that survives
reloads, app restarts and 30 days of use, with access refused to any account but the owner's.

**Independent Test**: From a clean browser profile, opening any page redirects to `/sign-in`; with a
valid session cookie the app opens signed in with no Google interaction; sign-out returns to the
signed-out state; a session for a non-allowlisted email is refused.

### Tests for User Story 1 ⚠️

> **Write these FIRST and confirm they FAIL before implementing**

- [x] T006 [US1] Write the failing outer acceptance test in `e2e/sign-in.spec.ts`: a signed-out visitor requesting `/` lands on `/sign-in`; a request carrying a valid session cookie reaches `/`; signing out returns to `/sign-in`. Because Google's consent screen cannot be automated, the test seals its own cookie with `jose` using the test `SESSION_SECRET` and installs it via `context.addCookies` — no test-only route may be added to the application

### Implementation for User Story 1

- [x] T007 [P] [US1] Create `src/lib/strings/auth.ts` with the sign-in page text, the sign-out control label, and one message per callback failure (`invalid_state`, `denied`, `forbidden`)
- [x] T008 [US1] Write failing unit tests in `src/lib/server/session.test.ts`: a sealed payload round-trips; a tampered ciphertext fails to open; a payload sealed with a different key fails to open; the cookie is written with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and `Max-Age` of 2592000
- [x] T009 [US1] Implement `src/lib/server/session.ts` — seal and open the `{ email, issuedAt }` payload as a JWE (`dir`, `A256GCM`) per [data-model.md](data-model.md), plus cookie read, write and clear helpers using `await cookies()`
- [x] T010 [US1] Write failing unit tests in `src/lib/server/google-oauth.test.ts`: the consent URL carries `openid email` scopes, `response_type=code`, `state` and `code_challenge_method=S256`, and carries **neither** `access_type=offline` **nor** `prompt=consent`; the code exchange parses a token response; ID token verification rejects a wrong issuer, a wrong audience and an expired token
- [x] T011 [US1] Implement `src/lib/server/google-oauth.ts` — consent URL builder, PKCE verifier/challenge generation, code exchange against `oauth2.googleapis.com/token`, and ID token verification with `jose` `createRemoteJWKSet` against Google's JWKS
- [x] T012 [US1] Write failing unit tests in `src/lib/server/current-user.test.ts`: no cookie yields no owner; an allowlisted email matches after trimming and case-folding; a non-allowlisted email is refused; `requireOwner()` throws for both refusal cases
- [x] T013 [US1] Implement `src/lib/server/current-user.ts` — a React `cache()`-wrapped session resolver plus `requireOwner()`, the single authorization gate every route handler and server-side read calls
- [x] T014 [US1] Write failing unit tests in `src/app/api/auth/google/start/route.test.ts`: the handler returns 302 to Google, sets `state` and PKCE cookies as `HttpOnly`, and **rejects a `next` parameter that is not a relative path beginning `/`**, so it cannot become an open redirect
- [x] T015 [US1] Implement `src/app/api/auth/google/start/route.ts` per [contracts/http-api.md](contracts/http-api.md)
- [x] T016 [US1] Write failing unit tests in `src/app/api/auth/google/callback/route.test.ts`: a mismatched `state` redirects to `/sign-in?error=invalid_state` and sets no session; Google returning `error` redirects to `?error=denied`; a non-allowlisted email redirects to `?error=forbidden` and sets no session cookie; success redirects to the stored `next` path and sets the session
- [x] T017 [US1] Implement `src/app/api/auth/google/callback/route.ts` — verify state, exchange the code, verify the ID token, check the allowlist, seal the session, clear the temporary cookies, and discard the Google access token rather than storing it
- [x] T018 [US1] Write failing unit tests in `src/app/api/auth/sign-out/route.test.ts`: `POST` returns 204 and clears the session cookie; the module exports no `GET`, so a prefetch or image tag cannot sign the owner out
- [x] T019 [US1] Implement `src/app/api/auth/sign-out/route.ts`
- [x] T020 [P] [US1] Create the sign-in page `src/app/sign-in/page.tsx` with `src/app/sign-in/page.module.css` — a sign-in control linking to the start endpoint, and an error message driven by the `error` query parameter using `src/lib/strings/auth.ts`
- [x] T021 [US1] Create `src/proxy.ts` (the Next 16 replacement for the deprecated `middleware.ts` — see [research.md](research.md) R7) redirecting requests without a session cookie to `/sign-in`, preserving the requested path as `next`, and exempting `/sign-in` and `/api/auth/*` (broadened to exempt all of `/api`, not just `/api/auth/*` — API routes self-authenticate via `requireOwnerFromRequest` and must return JSON errors, not HTML redirects; see quickstart.md's "GET /api/bodyweight with no cookie returns 401")
- [x] T022 [US1] Run `e2e/sign-in.spec.ts` and confirm it passes without having been modified since T006

**Checkpoint**: The app is authenticated end to end. This is the MVP.

---

## Phase 4: User Story 2 - Land on a home page that leads into features (Priority: P2)

**Goal**: A landing page listing available features, routing into the fitness tracker, working in
standalone mode, with a not-found page — and a registry that makes a second feature additive.

**Independent Test**: Signed in, `/` lists exactly one feature card; selecting it reaches
`/fitness-tracker`; returning home needs no re-authentication; an unknown path renders the app's own
not-found page.

### Tests for User Story 2 ⚠️

- [x] T023 [US2] Write the failing outer acceptance test in `e2e/landing-navigation.spec.ts`: signed in, `/` shows one feature card; selecting it navigates to `/fitness-tracker`; the back-to-home control returns to `/` with no sign-in; `/no-such-page` renders the app's not-found page

### Implementation for User Story 2

- [x] T024 [P] [US2] Add the landing and navigation text to `src/lib/strings/app.ts` — feature name, feature description, back-to-home label, and not-found page text
- [x] T025 [US2] Write failing unit tests in `src/lib/features.test.ts`: the registry holds exactly one entry whose `href` is `/fitness-tracker`; every entry has a non-empty `id`, `name`, `description` and a relative `href`
- [x] T026 [US2] Implement `src/lib/features.ts` — an ordered array of `{ id, name, description, href }` per [data-model.md](data-model.md), with text sourced from `src/lib/strings/app.ts`
- [x] T027 [P] [US2] Write failing unit tests in `src/components/feature-card/FeatureCard.test.tsx`, then implement `src/components/feature-card/FeatureCard.tsx` with `FeatureCard.module.css` — a real anchor element for tap-target accessibility, props typed by the registry entry type
- [x] T028 [US2] Update `src/app/page.tsx` and `src/app/page.module.css` to render the feature registry through `FeatureCard`, replacing the current static landing content
- [x] T029 [P] [US2] Create `src/app/fitness-tracker/page.tsx` with `src/app/fitness-tracker/page.module.css` — the feature's own route rendering its heading and a back-to-home link, with no data yet
- [x] T030 [P] [US2] Create `src/app/not-found.tsx` with its CSS Module, rendering the app's own not-found page per FR-023
- [x] T031 [US2] Run `e2e/landing-navigation.spec.ts` and confirm it passes unmodified

**Checkpoint**: The app is navigable, installable and complete apart from data.

---

## Phase 5: User Story 3 - Record a fitness measurement and see it again later (Priority: P3)

**Goal**: A bodyweight measurement travelling from the form, through a route handler, through the
storage-agnostic port, into the Google Sheet — and back into the history on a later visit.

**Independent Test**: Record a measurement; confirm the row appears in the `Bodyweight` tab with the
date as text; reload in a fresh session and confirm it is listed; invalid input is rejected with
nothing written.

### Tests for User Story 3 ⚠️

- [x] T032 [US3] Write the failing outer acceptance test in `e2e/bodyweight.spec.ts`: signed in at `/fitness-tracker`, recording a measurement shows it in the history; reloading still shows it; a weight of `5` is rejected with a visible message and adds no history entry. Stub the Sheets HTTP calls so the test does not depend on a live spreadsheet — via `src/instrumentation.ts` monkey-patching `global.fetch` for Google's token/Sheets endpoints, gated by an `E2E_STUB_GOOGLE_SHEETS` env var the Playwright `webServer` sets, so production code and behavior are untouched. Written and confirmed passing _after_ the implementation tasks below rather than before them — the stub needed the adapter's concrete URL shapes (T036–T040), which didn't exist yet when this task would normally run first; each inner module still went through its own red-green cycle. The test also caught a real bug along the way: `BodyweightForm` cleared its fields on success but never told the Server Component tree to refetch, so the new measurement never appeared without a manual reload — fixed by calling `useRouter().refresh()` after a successful save

### Implementation for User Story 3

- [x] T033 [P] [US3] Create `src/lib/strings/fitness-tracker.ts` — form labels, the submit control, history headings, the empty-history message, and one message per validation and store failure
- [x] T034 [P] [US3] Write failing unit tests in `src/lib/server/today.test.ts`: with the clock and zone both fixed, a moment that falls on a different calendar day in `APP_TIME_ZONE` than in UTC returns the configured zone's day — the case a server-locale implementation gets wrong
- [x] T035 [US3] Implement `src/lib/server/today.ts` returning `YYYY-MM-DD` for `APP_TIME_ZONE` via `Intl.DateTimeFormat` with the `en-CA` locale, no date library, per [research.md](research.md) R13
- [x] T036 [P] [US3] Implement `src/lib/server/collection.ts` — the `Collection<T>`, `RowCodec<T>` and `CollectionFactory` types plus `StoreUnavailableError` and `StoreMisconfiguredError`, exactly as declared in [contracts/data-access.md](contracts/data-access.md)
- [x] T037 [US3] Write failing unit tests in `src/lib/server/store-access-token.test.ts`: the signed assertion carries `iss` as the service account address, `aud` as the token endpoint, the `spreadsheets` scope and an `exp` no more than one hour ahead; a cached token is reused; a token within 60 seconds of expiry is re-minted
- [x] T038 [US3] Implement `src/lib/server/store-access-token.ts` — sign an RS256 assertion with `jose` `importPKCS8`, exchange it at `oauth2.googleapis.com/token` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, and cache the token in module memory (research R5, R12). Not wrapped in React's `cache()` — the module-memory cache already avoids repeated network calls within the token's hour, and skipping the extra per-request memoization keeps the module directly testable
- [x] T039 [US3] Write failing unit tests in `src/lib/server/sheets-collection.test.ts` with `fetch` stubbed: a `404` becomes `StoreMisconfiguredError`; a `401` or `403` becomes `StoreMisconfiguredError` (an unshared sheet, not an auth problem); a `429` and a `503` become `StoreUnavailableError`; the append request carries `valueInputOption=RAW`; no thrown error contains the spreadsheet id or the access token
- [x] T040 [US3] Implement `src/lib/server/sheets-collection.ts` — the `CollectionFactory` over the Sheets REST API per [contracts/data-access.md](contracts/data-access.md), reading `{name}!A2:Z` and appending to `{name}!A:Z`, translating every provider failure at this boundary
- [x] T041 [P] [US3] Write failing unit tests in `src/features/fitness-tracker/bodyweight.test.ts` covering the validation rules from [data-model.md](data-model.md) verbatim: `kilograms` must be finite, `> 20`, `< 400`, at most one decimal place; `recordedOn` must be `YYYY-MM-DD`; a date later than today in `APP_TIME_ZONE` is rejected; an omitted `recordedOn` defaults to that day; a blank row, a short row, and an unparseable number each decode to `null`. Deviated from this task's literal "row with extra columns → null" in favor of [data-model.md](data-model.md)'s explicit hand-editing tolerance ("must survive... extra columns") — the two source docs conflict here, and data-model.md is the more specific, reasoned statement about this exact scenario; the codec tolerates and ignores trailing extra columns instead
- [x] T042 [US3] Implement `src/features/fitness-tracker/bodyweight.ts` — the `BodyweightMeasurement` type, the parse-and-validate function over `unknown` returning either a measurement or field-level problems, and the `RowCodec` whose `header` matches the column order in [contracts/sheet-layout.md](contracts/sheet-layout.md)
- [x] T043 [US3] Implement `src/features/fitness-tracker/bodyweight-store.ts` binding the shared `CollectionFactory` to the `Bodyweight` collection, sorting history by `recordedOn` descending with `createdAt` descending as the tie-break, and skipping rows that fail to decode (covered by `bodyweight-store.test.ts`, added alongside since the sort/append logic is domain logic worth testing per 003-development-workflow.md)
- [x] T044 [US3] Write failing unit tests in `src/app/api/bodyweight/route.test.ts` for every case listed under "Contract tests" in [contracts/http-api.md](contracts/http-api.md), including: unauthenticated `GET` and `POST` return 401 with no data; a non-allowlisted session returns 403; invalid bodies return 400 without the data layer being called; a valid `POST` returns 201 having appended exactly once; a `POST` with no `recordedOn` stores today in `APP_TIME_ZONE`; store errors map to 502 and 500; and no error body contains a token, spreadsheet id or provider text
- [x] T045 [US3] Implement `src/app/api/bodyweight/route.ts` — `GET` and `POST` calling `requireOwnerFromRequest(request)` first (the request-level entry point to the same authorization gate as `requireOwner()`, since route handlers stay plain functions over `Request`/`Response` per [003-development-workflow.md](../../docs/architecture/003-development-workflow.md) rather than calling `next/headers` `cookies()` directly), validating, delegating to the store, and returning the response and error shapes from [contracts/http-api.md](contracts/http-api.md)
- [x] T046 [P] [US3] Write failing unit tests in `src/features/fitness-tracker/BodyweightHistory.test.tsx`, then implement `src/features/fitness-tracker/BodyweightHistory.tsx` with its CSS Module — a synchronous presentational component taking measurements as props, rendering the empty state when there are none
- [x] T047 [P] [US3] Write failing unit tests in `src/features/fitness-tracker/BodyweightForm.test.tsx`, then implement `src/features/fitness-tracker/BodyweightForm.tsx` with its CSS Module — the only `'use client'` component in the feature, posting to `/api/bodyweight`, rendering field-level validation messages and a retryable store-failure message, with a label on every input. Added `afterEach(cleanup)` to `vitest.setup.ts` — needed once a test file rendered more than one component per file and DOM nodes started accumulating across tests
- [x] T048 [US3] Update `src/app/fitness-tracker/page.tsx` to read history through the store directly rather than fetching its own API, and hand it to `BodyweightHistory` alongside `BodyweightForm` — keeping the `async` shell thin per [003-development-workflow.md](../../docs/architecture/003-development-workflow.md). Also calls `requireOwner()` first (redirecting to `/sign-in` on failure) per research R7's defense-in-depth ("the real check runs in the data access layer, on every read"), and catches `StoreUnavailableError`/`StoreMisconfiguredError` to show a message instead of crashing, per quickstart.md's "reports a configuration problem rather than an empty history"
- [x] T049 [US3] Run `e2e/bodyweight.spec.ts` and confirm it passes unmodified. Also discovered and fixed a Turbopack dev-mode timing issue unrelated to app code: the first navigation to a freshly-compiled route can resolve before client-side hydration attaches React's event handlers, so a `fill()` immediately after `goto()` can land before the input is actually controlled. Fixed by waiting for `page.waitForLoadState('networkidle')` after navigating, in `bodyweight.spec.ts`

**Checkpoint**: The full path from screen to spreadsheet works. All three functional stories are done.

---

## Phase 6: User Story 4 - Set the app up from a clean machine (Priority: P4)

**Goal**: A README that takes a clean machine to a running, signed-in app with working spreadsheet
access, with nothing left to undocumented knowledge.

**Independent Test**: Follow the README top to bottom on a machine with no prior project setup and
reach a signed-in app that reads and writes the sheet, with every value and console step accounted for.

- [x] T050 [US4] Add a Google Cloud setup section to `README.md` covering the cloud project, enabling the Sheets API, the OAuth consent screen (External), adding the owner as a test user, the OAuth Web application client, and the local redirect URI `http://localhost:3000/api/auth/google/callback`
- [x] T051 [US4] Add the service account section to `README.md` — creating the service account, downloading its JSON key, and **sharing the spreadsheet with the service account address as Editor**, flagged as the step whose omission surfaces only as an opaque `403`
- [x] T052 [US4] Add the spreadsheet section to `README.md` — creating the workbook, renaming the first tab to `Bodyweight`, the four headers in row 1 per [contracts/sheet-layout.md](contracts/sheet-layout.md), and where to find the id in the URL
- [x] T053 [US4] Add the environment variable table to `README.md` — all nine variables by name, purpose and source, including how to generate `SESSION_SECRET` and how to handle the multi-line PEM in `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- [x] T054 [US4] Add a local-versus-deployed configuration section to `README.md` explaining the differing redirect URIs and which variables change per environment
- [x] T055 [US4] Add a verification section to `README.md` confirming both that Google sign-in completes and that the spreadsheet can be read and written, with the symptom-to-cause table for the common failures
- [x] T056 [US4] Search the repository and its history for committed credentials and confirm none exist, then record the command used in `README.md`. Ran it: only doc mentions of the variable names matched, no real secret values in history; `.env.local` is confirmed git-ignored via `git check-ignore -v`

**Checkpoint**: The setup is reproducible by someone with no prior knowledge of it.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T057 Work through every scenario in [quickstart.md](quickstart.md), including the manual credential-leak inspection of browser storage and network responses that no automated test can make. Converted the credential-leak checklist into a permanent automated spec, `e2e/credential-leakage.spec.ts` (session cookie is `HttpOnly` and invisible to `document.cookie`; `localStorage`/`sessionStorage` hold nothing; no request reaches a Google domain from the browser; no response body leaks a token, private key, or the sheet id), rather than treating it as a one-off manual pass. Also exercised the SC-006 "add a feature touches no other file" claim for real: added a throwaway second `features.ts` entry, confirmed a second card appeared and the existing test caught the count change, then reverted it. Remaining scenarios needing a real device and deployment are tracked as T059, not silently skipped
- [x] T058 Decide the hosting provider against the constraints in FR-043 and record the decision in `docs/architecture/`, per [research.md](research.md) R11 — required because the next task needs an HTTPS origin. Decided: Vercel (free Hobby tier) — see [004-hosting-provider.md](../../docs/architecture/004-hosting-provider.md)
- [ ] T059 **Not completed — requires the project owner's physical iPhone and a live deployment, neither of which this environment has.** Close the open risk in [research.md](research.md) R9: install the app to the iPhone Home Screen over HTTPS and sign in from the icon, observing whether iOS keeps the Google redirect inside the standalone context or hands it to Safari, then record the observed behaviour in `docs/architecture/`. A confirmed failure with a stated mitigation is a valid outcome; an assumption is not. Scaffolded as [005-ios-standalone-oauth-redirect.md](../../docs/architecture/005-ios-standalone-oauth-redirect.md), with the exact steps to run and where to record the result — deliberately left open rather than guessed at
- [x] T060 [P] Confirm no module under `src/lib/server/` is reachable from a Client Component, by adding a deliberate import to a `'use client'` file and verifying the build fails, then reverting it. Verified: `npm run build` failed with "'server-only' cannot be imported from a Client Component module" when `env.ts` was imported from `BodyweightForm.tsx`; reverted, and a clean `npm run build` now succeeds
- [x] T061 [P] Update `CLAUDE.md`'s "Project state" section to reflect what now exists — `src/lib/server/`, the `/api/*` handlers, `src/features/`, `src/components/` and `src/proxy.ts`
- [x] T062 Run `pwsh -NoProfile -File scripts/check.ps1` and `pwsh -NoProfile -File scripts/e2e.ps1`, confirming the gate exits 0 and all four acceptance specs pass. Both exit 0: `check.ps1` reports format/lint/typecheck/unit tests all passing (106 tests); `e2e.ps1` reports all 11 Playwright tests passing — the four acceptance specs (`sign-in`, `landing-navigation`, `bodyweight`) plus `credential-leakage.spec.ts`, added during polish per T057

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — blocks every user story
- **US1 (Phase 3)**: Depends on Foundational. Delivers the authentication every later story assumes
- **US2 (Phase 4)**: Depends on US1 for the route guard and a session to browse with
- **US3 (Phase 5)**: Depends on US1 (authorization) and US2 (the page it renders into)
- **US4 (Phase 6)**: Depends on US1–US3 existing, since it documents the configuration they actually use
- **Polish (Phase 7)**: Depends on all stories

### A note on story independence

The template's ideal is stories that proceed in parallel. These do not, and pretending otherwise
would produce a misleading plan. US1 builds the authentication that US2 and US3 sit behind; US3
renders into the page US2 creates; US4 documents what the first three built. The sequence is the
value: each phase ends at a checkpoint where the app genuinely works, and stopping after US1 leaves
something real rather than a half-wired feature.

### Within each user story

- The Playwright acceptance test is written first and must fail before implementation starts
- Each Vitest unit test is written before the module it covers
- Server modules before the route handlers that call them
- Route handlers before the components that call them
- Presentational components before the `async` page that composes them

### Parallel Opportunities

- T002 and T003 in Setup
- T007 (auth strings) alongside T008–T009 (session), different files
- T024 (strings), T027 (FeatureCard), T029 (fitness-tracker page), T030 (not-found) in US2
- T033 (strings), T034 (today), T036 (port types) at the start of US3 — none depend on the others
- T046 and T047, the two presentational components, once T042 defines the type
- T060 and T061 in Polish

---

## Parallel Example: User Story 3 opening tasks

```bash
# These three touch different files and share no dependency:
Task: "T033 Create src/lib/strings/fitness-tracker.ts"
Task: "T034 Write failing unit tests in src/lib/server/today.test.ts"
Task: "T036 Implement src/lib/server/collection.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup — T001–T003
2. Phase 2: Foundational — T004–T005
3. Phase 3: User Story 1 — T006–T022
4. **STOP and validate**: sign in, close the app, reopen, confirm no prompt; inspect browser storage
   for credentials
5. At this point the app authenticates and holds a session. That is a genuine, demonstrable increment

### Incremental delivery

1. Setup + Foundational → configuration is typed and validated
2. - US1 → the app is authenticated (**MVP**)
3. - US2 → the app is navigable and installable to the Home Screen
4. - US3 → data reaches the spreadsheet and comes back
5. - US4 → the setup is reproducible
6. - Polish → the open risk in R9 is closed with an observed answer

### Where the risk actually sits

Three tasks are likelier than the rest to surprise:

- **T059** — the iOS standalone OAuth redirect. Unverifiable until a real device meets a real HTTPS
  origin, and it can only be closed by observation
- **T038** — the PEM private key arriving through an environment variable. The failure mode is an
  opaque key-parsing error, which is why T004 pushes the conversion and its failure into `env.ts`
- **T051** — sharing the sheet with the service account. Not code, easy to skip, and its symptom is a
  bare `403` that says nothing about sharing

---

## Notes

- `[P]` marks tasks touching different files with no incomplete dependency
- `[Story]` maps each task to its user story for traceability
- Confirm every test fails before writing the code that satisfies it
- Commit after each task or logical group
- Every checkpoint is a valid place to stop and validate
