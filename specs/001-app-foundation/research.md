# Phase 0 Research: Personal App Foundation

**Feature**: [spec.md](spec.md) | **Date**: 2026-09-10

Every decision below was checked against the Next.js 16.3.4 documentation bundled in
`node_modules/next/dist/docs/`, not against recollection. Where that documentation contradicted the
conventional answer, the documentation won and it is called out.

---

## R1 — Session cookie format: encrypted, not merely signed

**Decision**: Seal the session as a JWE (`dir` key agreement, `A256GCM` content encryption) using
`jose`, keyed by a 32-byte `SESSION_SECRET`. Store the sealed string in one cookie:
`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days.

**Rationale**: Next's own authentication guide demonstrates a _signed_ JWT (`SignJWT`/`jwtVerify`),
whose payload is base64url — readable by anyone holding the cookie.

Under the service account design (R12) the payload holds only the owner's email, so a signed cookie
would in fact satisfy FR-009 on its own: no Google credential is in it. Encryption is kept anyway, for
two reasons. It costs nothing — `EncryptJWT`/`jwtDecrypt` is the same line count as signing, with
`jose` already present. And nothing in the payload benefits from being readable, so there is no reason
to publish it; if the session ever grows a field, the safe property holds without anyone having to
notice. `HttpOnly` is a same-origin script barrier, not a confidentiality guarantee, and is not a
substitute.

`SameSite=Lax` rather than `Strict`: the OAuth callback is a cross-site top-level GET returning from
Google, and `Strict` would withhold the cookie on that navigation. FR-004 permits either; `Lax` is the
one that works.

**Alternatives considered**:

- _Signed JWT (the Next docs example)_ — rejected: readable payload, fails FR-009.
- _`iron-session`_ — a good library that encrypts by default and wraps this exact pattern in ~100 KB.
  Rejected narrowly: it is `jose` plus cookie ergonomics, and we need `jose` anyway for ID token
  verification. Worth revisiting if the cookie handling grows awkward.
- _Server-side session store keyed by an opaque id_ — the more secure classic design, rejected because
  it requires a database or KV store, which Principle IV and "minimal infrastructure" both refuse.

---

## R2 — OAuth: hand-rolled authorization-code flow, no auth framework

**Decision**: Implement the authorization-code flow with PKCE directly, using `fetch` against
Google's documented endpoints. Two calls total: a consent redirect to
`accounts.google.com/o/oauth2/v2/auth`, and a code exchange at `oauth2.googleapis.com/token`. There is
no third call, because there is no refresh — see the scopes note below. CSRF `state` and the PKCE
`code_verifier` travel in short-lived `HttpOnly` cookies cleared on callback.

**Rationale**: The flow is roughly 80 lines. Auth.js would add a large dependency whose Google
handling still requires custom callbacks to reach what we need, and whose behaviour is the thing this
learning project most wants to see rather than import. Principle I's test — "do not introduce a
framework unless a concrete technical need justifies it" — is not met by a flow this small. The
genuinely dangerous parts are delegated to `jose`, not written by hand.

**Scopes: `openid` and `email` only.** This flow establishes _identity_ and nothing else. It requests
no Sheets scope, because the spreadsheet is reached with the application's own credential (R12), not
the owner's. Two consequences follow, and they are the reason the architecture is shaped this way:

- `access_type=offline` and `prompt=consent` are **not** used. They exist to obtain a refresh token,
  and this flow never needs one — Google is consulted once at sign-in, and the application's own
  30-day session cookie carries the owner from there. Nothing Google issues is stored past the
  callback.
- `openid` and `email` are non-sensitive scopes, so the app needs no verification and shows no
  unverified-app interstitial.

**Alternatives considered**:

- _Auth.js (NextAuth v5)_ — rejected for size and opacity, per above.
- _`google-auth-library` (602 KB)_ — rejected: it earns its keep on token refresh and ID token
  verification, both of which `jose` plus one `fetch` already cover here.

---

## R3 — Identity: verify the ID token with `jose`

**Decision**: Read the `id_token` from the token-endpoint response and verify it with `jose`'s
`createRemoteJWKSet` against `https://www.googleapis.com/oauth2/v3/certs`, checking issuer and
audience, then take `email` and `email_verified` from the payload. Compare `email` against
`ALLOWED_GOOGLE_EMAIL` and refuse anything else (FR-011).

**Rationale**: Google's documentation states that an ID token received directly from the token
endpoint over TLS, in response to a request authenticated with the client secret, may be used without
signature verification. We verify anyway: `jose` makes it about five lines, `createRemoteJWKSet`
handles key caching and rotation, and the alternative — trusting a decoded payload — is a habit worth
not forming. It also means the allowlist check reads from a verified claim.

**Alternatives considered**:

- _Call the `userinfo` endpoint with the access token_ — one more network round trip per sign-in for
  the same information the ID token already carries.
- _Decode without verifying_ — permitted by Google here, but a worse default to learn.

---

## R4 — Sheets access: the REST API through `fetch`, no client library

**Decision**: Call the Sheets REST API v4 directly:
`GET /v4/spreadsheets/{id}/values/{range}` to read, and
`POST /v4/spreadsheets/{id}/values/{range}:append?valueInputOption=RAW` to write, with a
`Bearer` access token.

**Rationale**: The application needs exactly two operations. Measured against that:

| Candidate            | Unpacked size | Verdict                                                                  |
| -------------------- | ------------- | ------------------------------------------------------------------------ |
| `googleapis`         | **213 MB**    | Rejected outright; it is the entire Google API surface.                  |
| `@googleapis/sheets` | 756 KB        | Rejected: a generated client for two endpoints we can call in ten lines. |
| `fetch`              | 0             | Chosen.                                                                  |

Keeping the call sites raw also keeps them inside the adapter, which is where provider knowledge is
supposed to be confined anyway (FR-027).

---

## R5 — Store-access tokens: minted on demand, cached in memory

**Decision**: `getStoreAccessToken()` mints a JWT bearer assertion, exchanges it for a Google access
token, and caches that token in module memory until 60 seconds before its expiry. No token is
persisted anywhere. The function is wrapped in React's `cache()` so one request mints at most once.

**Rationale**: With the service account design (R12) there is no user refresh token, so there is
nothing to refresh, nothing to store, and nothing to keep in sync with a cookie. Minting a fresh
assertion costs one signature and one HTTPS round trip, once an hour.

This replaces a materially more complicated earlier design, and the reason it was complicated is worth
recording. When the store was reached with the _owner's_ OAuth tokens, those tokens had to live in the
session cookie, which meant refreshing them meant **rewriting the cookie** — and `cookies().set()`
throws in a Server Component. Since `/fitness-tracker` is a Server Component that reads data directly,
some reads could never persist a refreshed token, forcing a scheme where refreshes happened in memory
and were written back only from route handlers, redundantly and occasionally twice.

None of that exists now. The framework constraint is still real; this design simply never meets it,
because the credential that reaches the store has nothing to do with the session cookie.

**Alternatives considered**:

- _Mint per request, no cache_ — one extra signature and round trip on every data operation, for no
  benefit. The cache is a module-level variable, not infrastructure.
- _Cache the token in the session cookie_ — reintroduces the cookie-write problem for no gain, and
  would put a store credential in the browser, violating FR-008a.

---

## R6 — Publishing status and the 7-day refresh token: no longer applicable

**Status**: Resolved by the R12 architecture change. Kept rather than deleted, because the trap is
real and someone will otherwise rediscover it.

**The trap**: Google issues refresh tokens that **expire after 7 days** for OAuth clients whose
consent screen is in "Testing" publishing status with an external user type. An earlier version of
this plan reached the spreadsheet with the owner's own OAuth credentials, which required storing and
refreshing exactly such a refresh token. Left in Testing — the default, and where a "add yourself as a
test user" instruction naturally leaves you — SC-001's 30-day requirement would have failed a week
after everything appeared to work, for a reason invisible in the code.

**Why it no longer applies**: this design stores no Google refresh token at all. Sign-in uses
`openid email`, consults Google once, and discards everything but the verified email. The
application's own session cookie provides the 30 days. The publishing status of the OAuth client no
longer affects session longevity, and non-sensitive scopes mean no verification and no unverified-app
interstitial either.

**What was rejected to get here**: the alternative was to publish the OAuth app "In production"
(unverified) so refresh tokens would not expire, keeping the owner's credentials as the path to the
sheet. It works, and it is one dropdown in the console. It was dropped because the service account
removes the whole question — and with it a sensitive scope, a verification warning, and the token
refresh machinery described in R5.

**What did not change**: adding the owner as a test user remains a README step. An external OAuth app
still needs it before verification, whatever the scopes.

---

---

## R7 — Route protection: `proxy.ts`, and a real check in the data layer

**Decision**: Use `src/proxy.ts` for a coarse redirect of signed-out visitors to `/sign-in`, preserving
the requested path for FR-013. Enforce the actual authorization in `requireOwner()` inside
`src/lib/server/current-user.ts`, called by every route handler and every server-side read.

**Rationale**: Two documented facts drive this. First, **`middleware.ts` is deprecated in Next.js
16 and renamed to `proxy.ts`** — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`
says so outright, and a codemod exists. Writing `middleware.ts` here would be writing to a deprecated
convention on day one. Proxy now defaults to the Node.js runtime, and setting `runtime` in a proxy file
throws.

Second, Next's data-security guide treats a proxy check as a convenience rather than a boundary, and
recommends a Data Access Layer that performs its own authorization and returns minimal DTOs. FR-001 is
satisfied by the DAL check; the proxy only improves the experience. Both are cheap; only one is
trusted.

**Rejected**: `unauthorized()` and `unauthorized.tsx`. They fit the requirement well, but are
`version: experimental` and require the `experimental.authInterrupts` flag. A redirect to `/sign-in`
needs no flag and no experimental surface.

---

## R8 — Input validation: hand-written narrowing, no schema library

**Decision**: Validate the `POST /api/bodyweight` body by narrowing `unknown` in a small exported
function in `src/features/fitness-tracker/bodyweight.ts`, unit-tested in Vitest.

**Rationale**: `zod` v4 is ~6 MB unpacked to validate an object with two fields. The repository's
TypeScript guideline already prescribes the pattern — "use `unknown` and narrow it before use. Data
crossing an external boundary is validated, not asserted" — and a pure validation function is the
easiest thing in the codebase to test. Revisit when a third or fourth endpoint repeats the work.

---

## R9 — OPEN RISK: OAuth redirect from an iOS standalone PWA

**Status**: Not resolvable by research; carries a verification task into Phase 2.

**The risk**: When a Home Screen web app in standalone display navigates to a cross-origin URL —
`accounts.google.com` — iOS may hand the navigation to Safari rather than keeping it in the standalone
context. If the OAuth callback then completes in Safari, the session cookie is set in Safari's cookie
store, and the standalone app, returning to a potentially separate storage context, may still be
signed out. That would break User Story 1's central promise on the exact platform the app targets.

**Why it stays open**: This is iOS-version-specific behaviour that has changed repeatedly across
16.4, 17 and 18. Playwright's mobile WebKit emulates the viewport and user agent, not iOS's standalone
storage partitioning, so no test in this repository can answer it. Asserting an answer here would be
guessing.

**How it gets closed**: a task in Phase 2 that performs a real sign-in from the Home Screen icon on the
owner's iPhone against an HTTPS origin, and records the observed behaviour in
`docs/architecture/`. This is also the event most likely to force the hosting decision (R11), since it
needs a real HTTPS origin.

**Mitigations already in the design, should the risk land**: full-page redirect rather than a popup
(popups behave worst in standalone); `SameSite=Lax` so the cookie survives the cross-site return
navigation (R1); and sign-in being a once-per-30-days event, so even a clumsy flow is rarely met.

---

## R10 — Feature registry as the extension point

**Decision**: `src/lib/features.ts` exports an ordered list of `{ id, name, description, href }`. The
landing page maps over it. Adding a feature means adding an entry plus its own folders.

**Rationale**: FR-020 and SC-006 require that adding a feature touch no existing feature's code, and
SC-006 says this is "verifiable by diff". A registry makes that literally true. The alternative —
hard-coding a card per feature in `page.tsx` — would make every new feature a change to the landing
page's markup, which passes the letter of FR-020 but makes the diff argument weaker.

The registry holds presentation data only. It is not a plugin system, and features are not lazily
registered or discovered; that would be the enterprise-shaped version of the same idea and is exactly
what Principle I refuses.

---

## R11 — Deferred: hosting provider

**Decision**: Still undecided, per the spec, the constitution's Incremental Decisions, and
[001-application-foundation.md](../../docs/architecture/001-application-foundation.md).

**Trigger to decide**: the on-device verification in R9 needs an HTTPS origin, and Google's OAuth
client needs the deployed redirect URI registered. Whichever candidate is chosen must satisfy FR-043.
Nothing in this plan constrains the choice — no provider-specific API is used, and `next.config.ts`
stays provider-neutral.

---

## R12 — Store access: a service account, via the JWT bearer assertion grant

**Decision**: The application reaches the spreadsheet as itself, using a Google **service account**.
It signs a JWT with the service account's private key and exchanges it for an access token:

```text
POST https://oauth2.googleapis.com/token
  grant_type = urn:ietf:params:oauth:grant-type:jwt-bearer
  assertion  = <JWT, RS256, signed with the service account private key>
```

The assertion carries `iss` (the service account address), `scope`
(`https://www.googleapis.com/auth/spreadsheets`), `aud` (the token endpoint), `iat` and `exp` (at most
one hour out). Google returns a one-hour access token and **no refresh token** — by design, since a
new assertion can always be signed.

`jose` covers this with no new dependency: `importPKCS8` reads the PEM out of the service account key,
and `SignJWT` produces the assertion.

**Rationale**: This separates the two questions that were previously tangled — _who is using the app_
and _what may the server touch_. Identity is the owner's, via authorization code (R2). Store access is
the application's, and works whether or not anyone is signed in. Concretely it removes: the 7-day
refresh token expiry (R6), the token refresh and cookie-rewrite machinery (R5), the sensitive
`spreadsheets` scope from the consent screen, and the unverified-app interstitial.

**On the grant type**: this is RFC 7523's JWT bearer grant, which Google documents as the service
account flow or two-legged OAuth. It occupies the same conceptual slot as `client_credentials` —
machine-to-machine, no user, no consent — but is not literally that grant: the client proves itself by
signing an assertion with a private key rather than presenting a shared secret. The _implicit_ grant is
unrelated and would be wrong here on every count: it is a front-channel browser flow for public
clients, and OAuth 2.1 removes it.

**Costs, stated plainly**:

- A private key becomes a deployment secret. It arrives as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, a
  multi-line PEM in an environment variable — the classic snag, since most platforms deliver it with
  literal `\n` sequences that must be turned back into newlines before `importPKCS8` will accept it.
  `env.ts` does that once, and fails loudly at startup if the key does not parse.
- The spreadsheet must be **shared with the service account address** as an Editor. This was not
  needed when the owner's own credentials reached their own sheet, and it is the step most likely to
  be forgotten — its symptom is a `403` that the adapter reports as `STORE_MISCONFIGURED`.
- Rows are written by the service account, so the sheet's revision history attributes edits to it
  rather than to the owner. Irrelevant for a single-user app, but surprising the first time it is
  noticed.

**Alternatives considered**:

- _Owner's OAuth credentials reaching the sheet_ — the original design; see R6 for why it was dropped.
- _Domain-wide delegation (`sub` impersonation)_ — needs a Workspace domain and an admin grant, and
  would exist only to make edits appear under the owner's name. Not worth a Workspace dependency.
- _An API key_ — cannot work; API keys authorize only public, unauthenticated reads, and this sheet is
  private and written to.

---

## R13 — "Today" in a configured timezone, without a date library

**Decision**: Compute the current day with the platform's own internationalization API, formatting
`new Date()` in the `APP_TIME_ZONE` zone with the `en-CA` locale, which yields `YYYY-MM-DD` directly.
No date library.

**Rationale**: FR-031a requires the current day to come from a configured timezone rather than the
server's locale. That sounds like a job for `date-fns-tz`, `luxon` or `dayjs`, and it is not — Node
carries the full ICU timezone database, and this is a one-line formatting call. Adding a date library
for it would fail Principle I's test outright.

`en-CA` is chosen for its format, not its locale meaning: it is the standard trick for getting ISO
ordering out of `Intl.DateTimeFormat` without assembling parts by hand. If that reads as too clever
later, `formatToParts` is the explicit alternative and costs a few more lines.

**Testability**: the zone and the clock are both injected, so the case that matters — a moment that
falls on a different calendar day in the configured zone than in UTC — is a plain unit test rather
than something only reproducible late at night. That test is listed in
[contracts/http-api.md](contracts/http-api.md).

---

## Dependency summary

| Package       | Size (unpacked) | Why it earns its place                                                                                                                                                                                |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jose`        | 210 KB          | JWE session sealing (R1), Google ID token verification (R3), and RS256 signing of the service account assertion (R12). Encryption, JWT verification and JWS signing are not code to hand-roll.        |
| `server-only` | 611 B           | Turns "a Client Component must never import the Sheets or session module" from a review rule into a build error. FR-006 and FR-007 are hard requirements; this is how they are enforced mechanically. |

Nothing else is added. `googleapis`, `@googleapis/sheets`, `google-auth-library`, `iron-session`,
`next-auth`/Auth.js and `zod` were each considered and rejected above.
