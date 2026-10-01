# 005 — iOS standalone OAuth redirect

Status: **open**. Date opened: 2026-09-12.

## The question

[research.md](../../specs/001-app-foundation/research.md) R9: when the app is installed to the
iPhone Home Screen and launched standalone, does navigating to `accounts.google.com` for sign-in
stay inside the standalone context, or does iOS hand it to Safari? If Safari completes the OAuth
callback and sets the session cookie there, the standalone app — a separate storage context on some
iOS versions — may still show as signed out on return. That would break User Story 1's central
promise on the one platform this app targets.

## Why this file exists without an answer in it

This cannot be verified from here. It needs:

1. A deployed HTTPS origin — closed by [004-hosting-provider.md](004-hosting-provider.md) (Vercel).
2. A real iPhone, with the app actually installed to its Home Screen and launched standalone —
   not something a development environment or a CI runner can do, and not something Playwright's
   mobile WebKit emulation can answer either: it emulates the viewport and user agent, not iOS's
   standalone storage partitioning.

Writing an assumption here instead of leaving the question open would be worse than leaving it
open — it would look resolved without being resolved, and the whole reason this file exists
separately from research.md is to keep that distinction visible rather than buried in a "risks"
section no one re-reads.

## What to do to close this

Once the app is deployed (see [004](004-hosting-provider.md) and the README's
[Local versus deployed configuration](../../README.md#local-versus-deployed-configuration)
section for the second OAuth redirect URI this needs):

1. Add the deployed origin to the Home Screen from Safari on the iPhone.
2. Launch the app from its Home Screen icon (not from Safari) — confirm it opens without browser
   chrome.
3. Sign in from that standalone launch.
4. Observe: does the Google consent screen appear inside the standalone app, or does the screen
   visibly hand off to Safari? After completing consent, does the app return signed in, or does it
   show `/sign-in` again?
5. Record what actually happened below, replacing this section — a confirmed failure with a stated
   mitigation is a legitimate outcome and closes this file just as well as a confirmed success.

Mitigations already built into the design, per research.md R9, should the redirect prove to be a
problem: the callback does a full-page redirect rather than a popup (popups fare worst in
standalone), the session cookie is `SameSite=Lax` so it survives the cross-site return navigation,
and sign-in is a once-per-30-days event, so even a clumsy flow is rarely hit.

## Observed behaviour

_(Not yet recorded — pending the on-device test above.)_
