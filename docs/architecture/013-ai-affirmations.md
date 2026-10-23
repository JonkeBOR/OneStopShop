# 013 — AI affirmations

**Status**: accepted
**Date**: 2026-10-23

## Context

The workout-finished screen showed one of a few fixed lines. A short, over-the-top affirmation
written from the facts of the session just finished is more fun, but it needs a text model, a
secret key, and a guarantee that the screen never breaks, waits long or costs money because of it.

## Decision

### Gemini Developer API, free tier only

The text comes from the **Gemini Developer API** (Google AI Studio) on its free tier, with the model
`gemini-3.8-flash`. Cloudflare Workers AI was the simpler alternative, with no key and a binding,
and stays the fallback if Gemini's free tier goes away. Grok was ruled out because it has no free
tier.

The feature must never cost money. Only a model Google lists as free may be used. The Google Cloud
project behind the key has no billing account, now or later, so Google refuses requests when the
free quota runs out instead of charging. The tier is never upgraded, and Vertex AI and other paid
endpoints are not used. A used-up quota is an expected outcome that shows a fixed line. This follows
Principle IV of the constitution.

### The key is a server secret

`GEMINI_API_KEY` is configured like `GOOGLE_CLIENT_SECRET`: `.env.local` and `.dev.vars` locally, a
Worker secret in production, never in `wrangler.jsonc` `vars`, never `NEXT_PUBLIC_`, never in CI.
Only `src/lib/server/config.ts` reads it, through the optional `readGeminiConfig`, so a missing key
means fixed lines and does not break sign-in, CI or the end-to-end tests. The key travels in the
`x-goog-api-key` header, never in the URL, and is never logged.

### Three layers

1. **The client**, `generateJson` in `src/lib/server/gemini.ts`, takes a system prompt, a user
   message and a response schema, and returns the parsed JSON or `null`. It knows nothing about
   workouts. `fetch` is injected, so tests never reach Google.
2. **The writer**, `writeAffirmation(generate, facts)` in
   `src/features/fitness-tracker/server/affirmations.ts`, holds the prompt, its examples and the
   `parseAffirmation` check from `domain/affirmation.ts`. It never touches the database.
3. **The flow**, `affirmationFor`: claim, write, save, fall back. It is the only layer tied to the
   finished page.

The seam is there because generation may later move to a scheduled job that fills a shared pool of
affirmations without session facts. That job would replace layer 3 and reuse the other two. It is
not built.

### Once per session, with a daily cap

There is no endpoint that generates an affirmation. The finished page's `SessionAffirmation`, an
async Server Component inside `<Suspense>`, calls `affirmationFor` while it renders. Finishing a
workout is unchanged and never waits for Gemini.

`workout_sessions` gains `affirmation` and `affirmation_requested_at`
(`migrations/0012_session_affirmations.sql`). `claimAffirmation` is one conditional `UPDATE` that
sets `affirmation_requested_at` only if the session is the profile's, finished, never attempted and
fewer than `dailyAffirmationCap` (10) attempts began in the last 24 hours. One changed row means this
render owns the call. Otherwise the stored text is shown, or a fixed line when there is none. The
result is stored with `saveAffirmation`, which writes only while `affirmation` is `NULL`. A stolen
session cookie can therefore trigger at most ten Gemini calls a day.

### No retries

A failed, slow, blocked, rate-limited or invalid answer is not retried. The request has a 4 second
timeout, and any failure resolves to `null`, which shows a random fixed line. Retrying on reload would
turn an outage into a reload-driven request loop. The claim is never cleared, so a session keeps its
fixed line for good.

### What is sent to Google

Only workout facts built by `affirmationFacts`: workout name, block number, duration, totals of sets,
reps and volume, and per exercise its name, sets and top weight. No email, profile id, session id or
date. Free-tier inputs may be used by Google to improve its models, so the payload is limited to what
is harmless to share. Generated text is shown as plain text, and nothing acts on it.

## Consequences

- The fixed lines in `fitnessStrings.finished.affirmations` stay as the fallback for every failure
  and for a missing key.
- End-to-end tests blank `GEMINI_API_KEY` in `playwright.config.ts`, so they show a fixed line and
  never call Google.
- Whether OpenNext streams the `<Suspense>` boundary on a phone is checked by hand. If it does not,
  the page awaits `affirmationFor` instead, and the timeout still bounds the wait.
- The prompt is tuned by hand from real outputs. New-heaviest-weight facts are a possible follow-up.
