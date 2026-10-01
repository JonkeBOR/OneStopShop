# Phase 1 Data Model: Personal App Foundation

**Feature**: [spec.md](spec.md) | **Date**: 2026-09-10

Entities from the specification, expressed as the types the implementation will carry. Storage shape
lives in [contracts/sheet-layout.md](contracts/sheet-layout.md); this file is about meaning.

---

## Owner

The single permitted human. Not persisted — the app has no user table and never will while it has one
user. Identity is a verified `email` claim compared against configuration.

| Field   | Type     | Rules                                                                                                                                                     |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email` | `string` | From the verified Google ID token. Must equal `ALLOWED_GOOGLE_EMAIL`, compared case-insensitively after trimming, or access is refused with 403 (FR-011). |

Derived, never stored. There is no `User` record, no roles, no profile.

---

## SessionPayload

What the encrypted cookie contains. Two fields, and **no Google credential of any kind**.

| Field      | Type     | Rules                                                                                                                                                                                           |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`    | `string` | The verified owner email, from the Google ID token. Re-checked against the allowlist on every request, so revoking access is a configuration change rather than a session-invalidation problem. |
| `issuedAt` | `number` | Epoch milliseconds. Not used for expiry — the cookie's own `Max-Age` does that — but it makes a session's age visible when debugging.                                                           |

This is the shape that makes FR-006 through FR-009 nearly self-evident rather than carefully argued.
Google's tokens are read during the OAuth callback, used to verify identity, and discarded before the
response is written; nothing from Google is persisted. The credential that reaches the spreadsheet is
the service account's, held in server environment configuration and never in a cookie (FR-008a).

**Lifecycle**: created by the OAuth callback; read on every request; never rewritten — there is no
token to refresh, so the framework's prohibition on setting cookies from a Server Component is never
met (research R5); destroyed by sign-out or by the 30-day cookie `Max-Age`.

**Invariant**: no field of this type may appear in a route handler response body, in Server Component
props, or in any value crossing to a Client Component. The email is the owner's own and hardly a
secret, but the rule is kept absolute so it needs no case-by-case judgement. The type lives in a
`server-only` module, so a Client Component importing it is a build error.

**State transitions**:

```text
                    ┌──────────────┐
   no cookie ──────▶│  signed out  │◀──── sign-out, 30-day expiry, undecryptable cookie,
                    └──────┬───────┘      email no longer on the allowlist
                           │ Google consent + allowlist pass
                           ▼
                    ┌──────────────┐
                    │  signed in   │   (no substates — nothing in the session expires early
                    └──────────────┘    and nothing needs renewing)
```

Store-access failure is deliberately _not_ a session state. If the service account cannot reach the
sheet, the owner stays signed in and sees a store error; signing in again would not help, so the app
does not pretend otherwise by bouncing them to `/sign-in`.

---

## Feature

A landing-page entry. Presentation data, not a plugin descriptor (research R10).

| Field         | Type     | Rules                                                             |
| ------------- | -------- | ----------------------------------------------------------------- |
| `id`          | `string` | Stable, kebab-case.                                               |
| `name`        | `string` | From `src/lib/strings/`, never a literal in markup (Principle V). |
| `description` | `string` | Same. One short line for the card.                                |
| `href`        | `string` | Route segment beneath the app root, e.g. `/fitness-tracker`.      |

Today the registry holds exactly one entry (FR-016). It is an ordered array; ordering is the display
order.

---

## BodyweightMeasurement

The only persisted record in this feature. Deliberately one record type — see the spec's Assumptions
for why the rest of the fitness model is deferred.

| Field        | Type     | Rules                                                                                                                                                                                                                                                                                                                               |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `string` | UUID generated server-side at write time. Not used for lookup yet; it exists so a later edit or delete has something to address, and so two near-simultaneous writes from two devices stay distinguishable (spec edge case).                                                                                                        |
| `recordedOn` | `string` | ISO 8601 date, `YYYY-MM-DD`. Date, not timestamp — bodyweight is a daily measurement. Defaults to the current day in the configured timezone (`APP_TIME_ZONE`), computed server-side; the owner may override it with an earlier date to backfill. A date after that day is rejected. The browser's clock is never trusted for this. |
| `kilograms`  | `number` | Finite, `> 20` and `< 400`, at most one decimal place. Kilograms is fixed app-wide; no unit is stored per record. The bounds reject typos and unit confusion (a pounds figure entered as kilograms lands outside them) without pretending to be a medical range.                                                                    |
| `createdAt`  | `string` | ISO 8601 timestamp, server-assigned. Distinguishes when the row was written from the day it describes, which is what lets a backfilled entry sort sensibly.                                                                                                                                                                         |

**Validation** (FR-033) happens in one exported function in
`src/features/fitness-tracker/bodyweight.ts`, called by the route handler before anything reaches the
data layer. It returns either a valid measurement or a list of field-level problems — never a partial
write. Unit-tested in Vitest; it is a pure function over `unknown`.

**Ordering** (FR-032): most recent `recordedOn` first, ties broken by `createdAt` descending. Sorting
happens in the application, not the storage layer, because a spreadsheet has no ordering guarantee
worth trusting and the row count here is small.

**Tolerance for hand-editing** (spec edge case): the owner edits this spreadsheet by hand. Reading
must therefore survive blank rows, extra columns, and unparseable values. A row that cannot be parsed
is skipped, not thrown on; the history renders what it can. A parse failure is a data condition, not
an exception.

---

## Collection (storage port)

The shared abstraction FR-026 and FR-027 require. Full type in
[contracts/data-access.md](contracts/data-access.md).

A `Collection<T>` is a named, append-only sequence of records of one type, with a codec that maps a
record to and from a row of strings. Two operations only — `readAll` and `append`. The Google Sheets
adapter binds one collection to one tab.

The port speaks records; the adapter speaks A1 ranges. Nothing above the adapter knows a spreadsheet
is involved, which is the whole point of the requirement.

---

## What is deliberately absent

- **No `Workout`, `Exercise` or `Set`.** Named in the spec as the direction the layout must not
  preclude. The row-per-record, one-tab-per-collection shape accommodates them; specifying them is a
  later feature.
- **No user record, no session table, no audit log.** One user, stateless sessions, no compliance
  requirement.
- **No aggregation or trend types.** FR-030 only requires that entries carry a date so aggregation is
  _possible_ later. Computing it is not in this feature.
