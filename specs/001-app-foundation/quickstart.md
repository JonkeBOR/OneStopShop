# Quickstart: Validating the App Foundation

**Feature**: [spec.md](spec.md) | **Date**: 2026-09-10

How to prove this feature works, end to end. This is a validation guide, not an implementation guide —
implementation belongs in `tasks.md`. The README (FR-035) is the owner-facing version of the Google
setup summarised here; this file is the developer-facing checklist that says what "done" looks like.

---

## Prerequisites

|                |                                                   |
| -------------- | ------------------------------------------------- |
| Node.js        | >= 22.12                                          |
| PowerShell     | 7 (`pwsh`)                                        |
| Google account | The one that will own the app and the spreadsheet |

```pwsh
npm install
npm run e2e:install     # once
```

---

## One-time Google setup

The full step-by-step belongs in the README. What validation depends on:

Two independent Google credentials, for two different jobs. Keeping them straight is most of the
setup.

**For sign-in — who the owner is:**

1. A Google Cloud project.
2. An OAuth consent screen, **External** user type, with the owner added as a test user.
3. An OAuth client of type **Web application**, with redirect URI
   `http://localhost:3000/api/auth/google/callback` for local use. The deployed origin gets a second
   entry once hosting is chosen.

Scopes are `openid` and `email` only. Because these are non-sensitive, no verification is needed and
no unverified-app warning appears. Publishing status does not matter either — the app stores no
refresh token, so the 7-day Testing-mode expiry described in [research.md](research.md) R6 cannot
affect it.

**For the spreadsheet — what the server may touch:**

4. The **Google Sheets API** enabled in the same project.
5. A **service account**, with a JSON key created and downloaded.
6. A spreadsheet laid out per [contracts/sheet-layout.md](contracts/sheet-layout.md), **shared with
   the service account's address as an Editor**. This is the step most likely to be missed; its
   symptom is a `403` surfacing as `STORE_MISCONFIGURED`.

### Environment

`.env.local`, which is git-ignored and must stay that way (FR-040):

| Variable                             | Purpose                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`                   | OAuth client id — sign-in only                                                             |
| `GOOGLE_CLIENT_SECRET`               | OAuth client secret — sign-in only                                                         |
| `GOOGLE_OAUTH_REDIRECT_URI`          | Must match the console entry exactly, including scheme and port                            |
| `SESSION_SECRET`                     | 32 random bytes, base64. Generate with `openssl rand -base64 32`                           |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | `client_email` from the service account JSON key                                           |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from the same file — a multi-line PEM                                        |
| `GOOGLE_SHEET_ID`                    | From the sheet URL, between `/d/` and `/edit`                                              |
| `ALLOWED_GOOGLE_EMAIL`               | The one account permitted to use the app (FR-011)                                          |
| `APP_TIME_ZONE`                      | IANA zone name, e.g. `Europe/Oslo`. Decides what "today" means for a measurement (FR-031a) |

The private key is the awkward one. It contains real newlines, which most hosting platforms cannot
carry in an environment variable, so it is stored with literal `\n` sequences and converted back in
`env.ts` before `importPKCS8` sees it. Getting this wrong produces an opaque key-parsing error, so
`env.ts` should fail at startup with a message naming the variable — as it should for any missing or
malformed value, rather than failing at the first request with a stack trace.

---

## Running

```pwsh
npm run dev                                    # http://localhost:3000
pwsh -NoProfile -File scripts/check.ps1        # format + lint + typecheck + unit tests, must exit 0
pwsh -NoProfile -File scripts/e2e.ps1          # Playwright, mobile WebKit
```

See the `run-app` skill for LAN exposure and iPhone Safari testing.

---

## Validation scenarios

Each maps to a user story and its success criteria. Automated coverage is one Playwright acceptance
spec per story, written first; the manual checks are the ones no test in this repository can make.

### 1. Sign in once, stay signed in — US1, SC-001, SC-008

- [ ] With cookies cleared, opening `/` redirects to `/sign-in`.
- [ ] Signing in with the allowlisted account lands back on `/`.
- [ ] Reloading, closing the tab, and reopening all arrive signed in with no Google prompt.
- [ ] `POST /api/auth/sign-out` returns to a signed-out state.
- [ ] Requesting `/fitness-tracker` while signed out, then signing in, lands on `/fitness-tracker` and
      not on `/` (FR-013).
- [ ] `GET /api/bodyweight` with no cookie returns `401` with no data.

### 2. No credential reaches the browser — US1, SC-003, SC-004

The security requirements are the ones most worth checking by hand, because an automated pass proves
only what it thought to look for.

- [ ] In DevTools → Application: `localStorage`, `sessionStorage` and IndexedDB are empty of Google
      tokens. Only the session cookie exists, and it is flagged `HttpOnly` and `SameSite=Lax`.
- [ ] `document.cookie` in the console does not show the session cookie.
- [ ] Every response in the Network tab — including the HTML document's embedded payload — contains no
      `ya29.`-prefixed access token, no client secret, and no fragment of the service account private
      key. Search the raw document source, not just the rendered page.
- [ ] Decrypt the session cookie server-side and confirm it holds only `email` and `issuedAt`. The
      strongest form of this check is that there is no Google credential in it to leak.
- [ ] Outbound requests go to the app's own origin only. No request to `sheets.googleapis.com` appears
      in the browser at any point (FR-024).

### 3. Landing page and feature routing — US2, SC-006, SC-009

- [ ] `/` lists exactly one feature card, Fitness Tracker.
- [ ] Selecting it navigates to `/fitness-tracker`; returning home works without re-authentication.
- [ ] `/no-such-page` renders the app's own not-found page (FR-023).
- [ ] Adding a throwaway second entry to `src/lib/features.ts` makes a second card appear with no other
      file changed — then revert it. This is the SC-006 diff argument, checked rather than assumed.

### 4. Data round trip — US3, SC-005

- [ ] Recording a measurement shows it in the history immediately.
- [ ] The row appears in the `Bodyweight` tab with the four columns in order, the date as text and not
      a serial number.
- [ ] Reloading in a fresh session still lists it.
- [ ] A weight of `5`, of `500`, of `abc`, and a date in the future are each rejected with a message,
      and no row is written.
- [ ] Submitting with no date supplied stores today in `APP_TIME_ZONE`. Worth checking late in the
      evening, when the configured zone and UTC disagree about the date — that is the case a naive
      implementation gets wrong.
- [ ] An earlier date can still be entered, so a missed day can be backfilled.
- [ ] With `GOOGLE_SHEET_ID` set to a nonsense value, the app reports a configuration problem rather
      than an empty history.
- [ ] Un-sharing the sheet from the service account produces the same configuration error, not a
      sign-in prompt — signing in again cannot fix store access, and the app must not imply it can.
- [ ] Hand-adding a blank row and a garbage row to the sheet does not break the history.

### 5. On-device, standalone — US2, SC-009, and the open risk

Needs an HTTPS origin, so it follows the hosting decision.

- [ ] The app installs to the Home Screen and launches without browser chrome.
- [ ] Navigation between landing page and feature stays inside the installed app.
- [ ] **Sign in from the Home Screen icon.** This is the open risk in [research.md](research.md) R9:
      iOS may hand the Google redirect to Safari and strand the session there. Record what actually
      happens in `docs/architecture/` — a confirmed behaviour either way is worth more than the
      assumption.

### 6. Setup from clean — US4, SC-007, SC-011

- [ ] A reader following the README reaches a signed-in app with working sheet access, with no step
      requiring knowledge that is not written down.
- [ ] `git log -p | Select-String "client_secret|ya29\.|SESSION_SECRET="` finds nothing.

---

## Definition of done

- `scripts/check.ps1` exits 0.
- One Playwright acceptance spec per user story passes on mobile WebKit.
- Every box above is ticked, or the exception is written down — R9 in particular may close as
  "confirmed broken, mitigated by X" rather than as a pass, and that is a legitimate outcome.
