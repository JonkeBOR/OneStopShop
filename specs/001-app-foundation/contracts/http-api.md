# Contract: HTTP API

**Feature**: [spec.md](../spec.md) | **Date**: 2026-09-10

What the browser is allowed to call. These are the only network endpoints the client knows; it never
addresses Google or a spreadsheet (FR-024). Endpoints speak measurements, not ranges or row numbers
(FR-028).

All route handlers are plain functions over Web `Request`/`Response`, so they unit-test in Vitest
without an HTTP server, per [003-development-workflow.md](../../../docs/architecture/003-development-workflow.md).

---

## Error shape

Every failure returns this shape and nothing more. No provider message, no stack, no token, no
spreadsheet identifier (FR-029, and Next's BFF guidance: "avoid exposing sensitive information in
error messages").

```jsonc
{ "error": { "code": "INVALID_MEASUREMENT", "message": "Weight must be between 20 and 400 kg." } }
```

| Code                  | Status | Meaning                                                                                                                                       |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`     | 401    | No session, or the session could not be decrypted.                                                                                            |
| `FORBIDDEN`           | 403    | Valid session, but the email is not the allowlisted owner.                                                                                    |
| `INVALID_MEASUREMENT` | 400    | Body failed validation. `fields` carries per-field messages.                                                                                  |
| `STORE_UNAVAILABLE`   | 502    | Google Sheets was unreachable, rate-limited, or returned an error. Retryable.                                                                 |
| `STORE_MISCONFIGURED` | 500    | The spreadsheet or tab is missing, the service account key is bad, or the sheet is not shared with it. Not retryable; it needs configuration. |

`STORE_UNAVAILABLE` and `STORE_MISCONFIGURED` are distinct because the spec's edge cases treat them
differently: one asks the owner to retry, the other tells them something is set up wrong.

There is deliberately **no `REAUTHENTICATION_REQUIRED`**. Signing in again cannot fix store access,
because store access does not depend on the owner's sign-in at all (research R12) — so a store failure
must never be dressed up as an authentication problem. A missing or undecryptable session cookie is
plain `UNAUTHENTICATED`.

---

## Authentication

### `GET /api/auth/google/start`

Begins the flow. Generates `state` and a PKCE `code_verifier`, stores both in short-lived `HttpOnly`
cookies, and redirects to Google's consent screen.

|         |                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Query   | `next` (optional) — the path to return to after sign-in (FR-013). Rejected unless it is a relative path beginning `/`, so it cannot become an open redirect. |
| Success | `302` to `accounts.google.com/o/oauth2/v2/auth`                                                                                                              |
| Scopes  | `openid`, `email` — identity only                                                                                                                            |
| Params  | `response_type=code`, `code_challenge_method=S256`                                                                                                           |

No Sheets scope is requested: the spreadsheet is reached with the application's own service account,
not the owner's authorization (research R12). And `access_type=offline` / `prompt=consent` are
deliberately absent — they exist to obtain a refresh token, which this flow neither receives nor
needs. Their absence is what keeps the consent screen to a single tap on re-authentication.

### `GET /api/auth/google/callback`

Google redirects here. Verifies `state` against the cookie, exchanges the code, verifies the ID token,
checks the allowlist, seals the session, clears the temporary cookies. The Google access token from the
exchange is used for nothing and is discarded with the rest of the response; only the verified email
survives into the session.

| Outcome                                        | Response                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Success                                        | `302` to the stored `next` path, or `/`. `Set-Cookie: session=<JWE>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` |
| `state` missing or mismatched                  | `302` to `/sign-in?error=invalid_state`                                                                                       |
| Google returned `error` (owner denied consent) | `302` to `/sign-in?error=denied`                                                                                              |
| Email not on the allowlist                     | `302` to `/sign-in?error=forbidden`, no session cookie set (FR-011)                                                           |

Failures redirect rather than return JSON: this endpoint is reached by top-level navigation, so the
owner must land on a page, not a JSON body.

### `POST /api/auth/sign-out`

Clears the session cookie (FR-012). `204`. `POST`, not `GET`, so a prefetch or an image tag cannot sign
the owner out.

---

## Bodyweight

Both require a valid session for the allowlisted owner. Both call `requireOwner()` before touching
data — the proxy redirect is not the check that matters (research R7).

### `GET /api/bodyweight`

```jsonc
{
  "measurements": [
    {
      "id": "0f8c…",
      "recordedOn": "2026-09-10",
      "kilograms": 82.4,
      "createdAt": "2026-09-10T06:12:03.000Z",
    },
  ],
}
```

`200`. Most recent first. Unparseable spreadsheet rows are skipped rather than failing the request
(see [data-model.md](../data-model.md)). An empty history is `{ "measurements": [] }` with `200`, not
a 404 — no history is a valid state, not an error.

### `POST /api/bodyweight`

```jsonc
{ "kilograms": 82.4, "recordedOn": "2026-09-09" }
```

`recordedOn` is **optional**. Omitted, it becomes the current day in the configured timezone,
computed server-side — the browser's clock is never trusted for it. Supplied, it must be a
`YYYY-MM-DD` date no later than that day; a future date is rejected as `INVALID_MEASUREMENT`. The
override exists so a missed weigh-in can be backfilled.

`id` and `createdAt` are assigned server-side; a client-supplied value for either is ignored.

| Outcome            | Response                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Created            | `201` with the created measurement in `{ "measurement": … }`                                                     |
| Validation failed  | `400` `INVALID_MEASUREMENT`, with `fields` naming each problem. Nothing written (FR-033).                        |
| Sheets unreachable | `502` `STORE_UNAVAILABLE`. Nothing written, and no success is reported for a write that did not happen (FR-029). |

---

## Contract tests

Each row is a Vitest case calling the exported handler with a constructed `Request`:

- Unauthenticated `GET` and `POST` → `401`, no data in the body.
- Session for a non-allowlisted email → `403`.
- `POST` with a missing weight, a non-numeric weight, a weight of `5`, a weight of `500`, a malformed
  date, and a date one day in the future → `400`, and the data layer is never called.
- `POST` with no `recordedOn` → `201`, and the stored date is today in the configured timezone. Tested
  with the clock and the zone both fixed, including a time that falls on a different calendar day in
  UTC than in the configured zone — the case a server-locale implementation gets wrong.
- `POST` valid → `201`, and the data layer received exactly one append.
- Data layer throwing the unavailable error → `502`; throwing the misconfigured error → `500`.
- `GET` with two well-formed rows and one malformed row → `200` with two measurements.
- Every error response body → matches the error shape, and contains no token, spreadsheet id, or
  provider text.
