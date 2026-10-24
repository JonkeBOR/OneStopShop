# OneStopShop Constitution

## Core Principles

### I. Simplicity First (NON-NEGOTIABLE)

OneStopShop is a personal, low-traffic application and a learning project, not an
enterprise system. Every architecture, tooling, or infrastructure decision MUST prefer
**simple + understandable + secure enough + easy to deploy** over enterprise-style patterns.
Do not introduce a service, abstraction layer, framework, or infrastructure component unless a
concrete technical need justifies it. Decisions not yet required (e.g. schema design, pull-request checks) are deferred rather than solved speculatively.

**Rationale**: The project exists partly to give the developer hands-on React/Next.js experience
without the overhead of production-grade infrastructure a personal single-user app does not need.

### II. Server-Mediated Data Access

The React client (browser/PWA) MUST NOT communicate directly with the database or any other
persistence backend. All data access goes through the Next.js server acting as a
Backend-for-Frontend (BFF), exposed to the client as application-specific endpoints rather than
raw storage-provider calls. D1 is reached only through a Worker's binding: the app Worker's, or the
jobs Worker's for scheduled jobs. The client reasons about application data, never about the shape of a
storage provider's API.

**Rationale**: Keeps storage access and provider-specific logic server-side, and allows the
persistence layer (D1/SQLite today) to change later without breaking the client contract.

### III. Session/Identity Separation

Google OAuth (identity and authorization) and the application's own session (a secure, persistent
HTTP cookie managed by the Next.js server) are distinct concerns and MUST be implemented as such.
Google OAuth is used for identity only and MUST request no scope beyond `openid`, `email` and
`profile`. Google tokens and credentials MUST stay server-side: never in `localStorage`,
`sessionStorage`, IndexedDB or any other client-accessible storage, and never in page props or
response bodies. The browser holds only the application session cookie, set `HttpOnly`, `Secure`
and `SameSite=Lax` or `Strict`. Once a session is established, the app MUST keep
working across lock/unlock, app switching, PWA close/reopen, and page reload without forcing a
new interactive Google login, re-authenticating via Google OAuth only when the session actually
expires.

**Rationale**: Prevents Google credentials from leaking into client-side JavaScript and gives a
seamless "open app → already authenticated" experience appropriate for a Home Screen PWA.

### IV. Free-Tier Hosting Constraint

Hosting and infrastructure choices MUST fit within a genuinely free service tier unless a concrete
technical reason requires otherwise. The app does not need high availability, autoscaling,
enterprise infrastructure, paid databases, or dedicated servers, and MUST NOT take on such
dependencies by default. The chosen platform, Cloudflare Workers with D1, MUST be used within its free
tier; paid add-ons require a concrete need recorded in `docs/architecture/`. The app deploys as a
single Worker serving both pages and server — no separate frontend and backend hosting. Scheduled
jobs run in one separate jobs Worker with no HTTP surface, also on the free plan, as recorded in
`docs/architecture/014-scheduled-jobs.md`.

**Rationale**: This is a personal, low-traffic application; ongoing cost and operational overhead
must stay proportionate to that reality.

### V. Self-Documenting Code

Code MUST be self-documenting through clear naming and structure. Do not add comments explaining
what code does. Do not use inline CSS (`style="..."` attributes or inline style objects) — styling
belongs in stylesheets/CSS modules. Do not hardcode bare user-facing strings directly in
HTML/markup — route them through constants or a translation/i18n layer.

**Rationale**: Consistent, explicit code style keeps a small personal codebase maintainable
without relying on comments or ad hoc styling/text conventions to compensate for unclear code.

## Technology Stack

Frontend and BFF: **React**, **Next.js**, **TypeScript**. Next.js provides both the client-side
React application and the server-side BFF in one deployable unit. Hosting: **Cloudflare Workers**,
built with the OpenNext adapter (`@opennextjs/cloudflare`) and running with the `nodejs_compat`
flag; the Workers runtime is not Node.js, so every server-side dependency MUST be verified to run
there. Persistence: a **SQLite-family database** — **Cloudflare D1** in the cloud, reachable only
through the Worker's binding, and a **local SQLite file** in development — with schema and
migrations single-sourced in **Drizzle ORM** and checked into the repository. Drizzle MUST be
introduced by the first feature that stores data, alongside that feature's tables, and not before.
After that, every schema change MUST go through it. Authentication:
**Google OAuth** for identity only, using the developer's own Google account/Google Cloud project.
Testing: **Vitest** for unit tests and **Playwright** (mobile WebKit) for end-to-end tests, with a
**Playwright MCP** browser for exploratory checks, as recorded in
`docs/architecture/002-testing-strategy.md`. Charting: **Recharts**, rendered only in small Client
Components that take server-built props, as recorded in `docs/architecture/011-progress-charts.md`.
Scheduled work: **Cloudflare Cron Triggers** on the jobs Worker in `jobs/`, as recorded in
`docs/architecture/014-scheduled-jobs.md`. AI text: the **Gemini Developer API** free tier, called
only from the jobs Worker through `src/lib/gemini/client.ts`, as recorded in
`docs/architecture/015-weekly-affirmation-categories.md`; never a paid tier. Google Sheets and the Google Sheets API are not part of the stack. Any change to this stack is a
deliberate architectural decision and MUST be reflected here and in `docs/architecture/`.

## Incremental Decisions

The following remain intentionally undecided until actually needed, per Principle I: exact Google
OAuth library/session-management implementation, database schema beyond what a feature needs,
API endpoint design, data/repository abstraction, UI/component architecture, offline
support, error handling strategy, and pull-request checks. Each MUST be decided incrementally,
at the point of implementation, rather than speculatively up front — and each cross-cutting
decision should be captured in `docs/architecture/` once made. Feature-scoped decisions live in
the code and its tests; they reach `docs/architecture/` only when they outlive the feature.

## Development Workflow

Development is test-driven, as recorded in `docs/architecture/003-development-workflow.md`. Each
feature MUST begin with one Playwright acceptance test in `e2e/`, written from the phone's point
of view and confirmed failing for the intended reason before implementation starts; the feature is
done when that test passes unmodified. A **domain-only feature** adds domain rules or stored data
but no screen or route the phone can reach. It is exempt from the Playwright test, because no
phone-level behaviour exists to check. Acceptance scenarios describing the behaviour it promises
MUST then serve as its acceptance tests instead: they are written first as Vitest tests, confirmed failing, and the feature is done
when they pass unmodified. The first later feature that exposes the domain to the phone MUST bring
its own Playwright acceptance test. Within a feature, domain logic, route handlers, data
mapping, validation and synchronous component behaviour MUST be driven by a Vitest
red-green-refactor loop. Styling and layout are exempt and are checked in a real browser instead.
Business logic MUST live where Vitest can reach it — if a rule can only be tested through
Playwright, it is in the wrong place. Every code change MUST finish with
`scripts/check.ps1` exiting 0.

## Governance

This constitution supersedes other informal practices for OneStopShop. Amendments are made
by editing `docs/constitution.md` directly and bumping the version per semantic versioning: MAJOR
for backward-incompatible principle removals/redefinitions, MINOR for new principles or materially
expanded guidance, PATCH for clarifications and wording fixes. The Last Amended date MUST be
updated on every substantive change.

Every change MUST be checked against these principles; any deviation MUST be justified in
`docs/architecture/` rather than silently introduced. Use the guideline documents under `docs/`
and the architecture decisions under `docs/architecture/` for detailed runtime/architecture
guidance that supplements, but does not override, this constitution.

**Version**: 2.5.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-10-24
