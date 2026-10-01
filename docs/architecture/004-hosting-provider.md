# 004 — Hosting provider

Status: accepted. Date: 2026-09-12.

## Decision

**Vercel**, on its free Hobby tier.

## Context

[001-application-foundation.md](001-application-foundation.md) left hosting deliberately
undecided, per the constitution's Free-Tier Hosting Constraint and Incremental Decisions section.
The trigger to decide was named in [research.md](../../specs/001-app-foundation/research.md) R11:
closing the open OAuth-in-standalone-PWA risk in R9 needs a real HTTPS origin, and Google's OAuth
client needs that origin's redirect URI registered before a real device test can run.

## Requirements, restated from the constitution and R11

A candidate must support, on a genuinely free tier: HTTPS by default, environment
variables/secrets, persistent HTTP cookies, and outbound HTTPS requests to Google's APIs. Nothing
in this codebase is provider-specific — `next.config.ts` stays plain, and no platform SDK is
imported anywhere.

## Why Vercel

- It is built by the Next.js maintainers, so the App Router conventions this codebase already uses
  — route handlers under `app/api/`, `proxy.ts`, `instrumentation.ts` — are first-class deployment
  targets with no adapter, no build configuration, and no platform-specific code.
- The free Hobby tier covers everything this app needs: HTTPS on a `*.vercel.app` subdomain out of
  the box, environment variables per-project (including the multi-line service account private
  key), and outbound HTTPS with no allowlist.
- Deploying is `git push`; there is no infrastructure to write or maintain, which is what
  Simplicity First actually asks for here — the alternative to "no decision" was never "the most
  configurable platform," it was "the one that adds the least."

## Alternatives considered

- **Netlify** — comparable free tier and Next.js support, but is a second-class runtime for the App
  Router's newer conventions (proxy, instrumentation) compared to Vercel's first-party support.
  Rejected for needing more verification of exactly the surface this app relies on.
- **Railway / Render / Fly.io** — general-purpose platforms that run a persistent Node process
  rather than Vercel's per-request model. Reasonable choices, but each asks for more manual
  configuration (a `Dockerfile` or build command, a persistent free-tier allowance that is smaller
  or time-limited) for no capability this app uses. Worth revisiting only if a concrete need for a
  long-running process appears — none does.
- **Self-hosting on a VPS** — rejected outright: it is the one option that would require actually
  maintaining a server, which is precisely the operational overhead Principle IV exists to avoid for
  a single-user personal project.

## Consequence: one redirect URI to add

Once deployed, the Google Cloud console's OAuth client needs a second redirect URI —
`https://<project>.vercel.app/api/auth/google/callback` (or a custom domain, if one is attached) —
alongside the existing `localhost` entry. See the README's
[Local versus deployed configuration](../../README.md#local-versus-deployed-configuration) section.

## What this does not close

This decision only supplies the HTTPS origin research.md R9 needs. R9 itself — whether iOS hands
the Google OAuth redirect to Safari when the app is launched standalone from the Home Screen, and
whether the session survives that — still requires an actual device test against this deployed
origin. See [005-ios-standalone-oauth-redirect.md](005-ios-standalone-oauth-redirect.md).
