# BoombasticTracker

A personal web app, installed to an iPhone Home Screen as a PWA. Fitness tracking is its first
feature.

## Quickstart

    npm install
    npm run e2e:install         # once, downloads WebKit for the end-to-end tests
    npm run dev
    pwsh -NoProfile -File scripts/check.ps1

Requires Node.js 22.12 or newer and PowerShell 7 (`pwsh`).

The app will not start until every variable in [Environment variables](#environment-variables) is
set in `.env.local`. The sections below walk through obtaining each one, on a machine that has
never touched this project before.

## Google Cloud setup

Two independent things are being set up here, for two different jobs — keeping them straight is
most of what follows. **Sign-in** establishes who you are, using Google OAuth. **The spreadsheet**
is reached by the application itself, as itself, using a service account — not your Google
account. Sign-in never grants access to the spreadsheet, and the spreadsheet is never reached with
your sign-in credentials.

1. Create a project in the [Google Cloud console](https://console.cloud.google.com/) (or reuse an
   existing one).
2. **OAuth consent screen** — APIs & Services → OAuth consent screen.
   - User type: **External**.
   - Add yourself as a **test user**. Without this, Google refuses sign-in for anyone but the
     project owner while the app is unpublished, and the app never needs to be published — the
     scopes below are non-sensitive, so nothing else about "Testing" status matters here.
   - Scopes: none need adding at this step; the app requests `openid` and `email` at sign-in time.
3. **OAuth client** — APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Authorized redirect URI, for local development:
     `http://localhost:3000/api/auth/google/callback`
   - Save the **Client ID** and **Client secret** — they become `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET`.
   - A deployed environment needs a second redirect URI added here, once hosting is chosen — see
     [Local versus deployed](#local-versus-deployed-configuration).
4. **Enable the Google Sheets API** — APIs & Services → Library → search "Google Sheets API" →
   Enable.

## Service account

The service account is a separate Google identity the application authenticates as. It never sees
a browser and is never involved in signing in.

1. APIs & Services → Credentials → Create Credentials → **Service account**. Any name works; it is
   never shown to you again outside the console.
2. Open the new service account → **Keys** → Add key → Create new key → **JSON**. Downloading this
   file is the only chance to get the private key — Google does not let you retrieve it again.
3. From the downloaded JSON:
   - `client_email` becomes `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - `private_key` becomes `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — see
     [Environment variables](#environment-variables) for the multi-line caveat.
4. **Delete the downloaded JSON file once its two fields are copied into `.env.local`.** It is a
   plaintext credential with no expiry; there is no reason to keep a second copy of it on disk.

**This service account must be shared on the spreadsheet as an Editor** — see the next section.
Skipping that step is the single most likely setup mistake, and its symptom is a bare `403` that
mentions neither sharing nor permissions.

## Spreadsheet

1. Create a new Google Sheet.
2. Rename its first tab to `Bodyweight` (exact spelling and case — the app reads this tab by name).
3. Put these four headers in row 1, in this order:

   | A    | B            | C           | D           |
   | ---- | ------------ | ----------- | ----------- |
   | `id` | `recordedOn` | `kilograms` | `createdAt` |

4. Copy the spreadsheet id out of its URL — the segment between `/d/` and `/edit`:

   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

   This becomes `GOOGLE_SHEET_ID`.

5. **Share the spreadsheet with the service account's address** (its `client_email`, e.g.
   `something@your-project.iam.gserviceaccount.com`) **as Editor.** The app reaches the sheet as
   the service account, not as you, so your own ownership of the sheet grants the app nothing on
   its own.

See [contracts/sheet-layout.md](specs/001-app-foundation/contracts/sheet-layout.md) for why the
layout is shaped this way, and what happens if a row is hand-edited into something unreadable.

## Environment variables

Create `.env.local` at the repo root (git-ignored; it must stay that way). All nine variables are
required — the app fails at startup, naming whichever one is missing or malformed, rather than
failing later with an opaque error.

| Variable                             | Purpose                                                                          | Source                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`                   | OAuth client id — sign-in only                                                   | The OAuth client, above                                  |
| `GOOGLE_CLIENT_SECRET`               | OAuth client secret — sign-in only                                               | The OAuth client, above                                  |
| `GOOGLE_OAUTH_REDIRECT_URI`          | Must match the console entry exactly, including scheme and port                  | `http://localhost:3000/api/auth/google/callback` locally |
| `SESSION_SECRET`                     | 32 random bytes, base64-encoded. Encrypts the application's own session cookie   | Generate with `openssl rand -base64 32`                  |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | The service account's address                                                    | `client_email` in its JSON key                           |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | The service account's private key                                                | `private_key` in the same JSON key                       |
| `GOOGLE_SHEET_ID`                    | Which spreadsheet to read and write                                              | The spreadsheet URL, above                               |
| `ALLOWED_GOOGLE_EMAIL`               | The one Google account permitted to use the app                                  | Your own Google account's email                          |
| `APP_TIME_ZONE`                      | IANA zone name, e.g. `Europe/Oslo`. Decides what "today" means for a measurement | Your own timezone                                        |

**The private key is the awkward one.** Its JSON form contains real newlines
(`-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`), and most places you might put an
environment variable — including a single line in `.env.local` — cannot carry a literal newline.
Store it with literal backslash-`n` sequences instead of real line breaks:

    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n

The app converts these back to real newlines at startup and fails immediately, naming the
variable, if the result is not a well-formed PEM block. This is the failure mode most likely to
look like a bug in the app rather than a copy-paste mistake, so it is worth checking first if
`npm run dev` fails on `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

## Local versus deployed configuration

Most of the nine variables above are the same in every environment. Two are not:

- `GOOGLE_OAUTH_REDIRECT_URI` must match, character for character, one of the redirect URIs
  registered on the OAuth client in the Google Cloud console. Add a second URI there —
  `https://<your-deployed-domain>/api/auth/google/callback` — once a hosting provider is chosen,
  and point the deployed environment's `GOOGLE_OAUTH_REDIRECT_URI` at it. Do not reuse the
  `localhost` URI for a deployed environment; it will not match and sign-in will fail with
  `invalid_state` or a redirect-URI-mismatch error from Google.
- `APP_TIME_ZONE` should reflect where the app is actually used, not where it happens to be
  hosted — a server can run in any region without changing what "today" means for a measurement.

Every other variable — both Google credentials, the sheet id, the allowlisted email, the session
secret — stays the same across environments unless you deliberately rotate one.

## Running and verifying

    npm run dev                                    # http://localhost:3000
    pwsh -NoProfile -File scripts/check.ps1        # format + lint + typecheck + unit tests
    pwsh -NoProfile -File scripts/e2e.ps1          # Playwright, mobile WebKit

Two things are worth confirming by hand beyond what the scripts check:

1. **Sign-in completes.** Open the app, follow the sign-in control, and land back on the app
   signed in. Reloading, closing the tab and reopening should not ask you to sign in again.
2. **The spreadsheet round-trips.** From `/fitness-tracker`, record a measurement, and confirm the
   row appears in the `Bodyweight` tab — with the date as literal text, not a reformatted serial
   number.

| Symptom                                                                                                  | Likely cause                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| App fails to start, naming an environment variable                                                       | That variable is missing or malformed — see [Environment variables](#environment-variables)                                                      |
| Sign-in redirects back with `?error=invalid_state`                                                       | `GOOGLE_OAUTH_REDIRECT_URI` doesn't exactly match the console entry, or cookies were blocked                                                     |
| Sign-in redirects back with `?error=forbidden`                                                           | The signed-in Google account doesn't match `ALLOWED_GOOGLE_EMAIL`                                                                                |
| The fitness tracker page shows a store error, or `/api/bodyweight` returns `STORE_MISCONFIGURED`         | The spreadsheet is not shared with the service account as Editor, the `GOOGLE_SHEET_ID` is wrong, or the `Bodyweight` tab was renamed or deleted |
| The fitness tracker page shows a retryable store error, or `/api/bodyweight` returns `STORE_UNAVAILABLE` | Transient — Google Sheets was rate-limited or briefly unreachable; retry                                                                         |

## Checking for committed credentials

Run this before ever pushing, and again if in doubt:

    git log -p | Select-String "client_secret|ya29\.|SESSION_SECRET=|BEGIN PRIVATE KEY"

A clean history prints nothing. `.env.local`, `.env*.local`, `*.pem` and `service-account*.json`
are all git-ignored (see `.gitignore`), and `.env.example` in the repo root carries placeholder
values only — never a real credential.
