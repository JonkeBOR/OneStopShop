# 015 — Weekly affirmation categories

**Status**: accepted
**Date**: 2026-10-24

## Context

[013](013-ai-affirmations.md) shipped first: one Gemini call per finished session, made while the
finished page rendered, with a 4 s timeout and a fixed line as fallback. Under load, the free tier
answered with `503`, or after more than two minutes, so most live calls timed out into fixed lines.
A page render leaves no room to wait or retry. This decision replaces 013 and moves Gemini off the
page entirely.

## Decision

### Six achievement categories

The finished page classifies the session with `sessionAchievement(session, previousBests)`, a pure
function in `domain/achievement.ts`. The categories are defined once, as `affirmationCategories` in
`domain/affirmation.ts`, in order of increasing achievement. That list drives the prompt, the
response schema, validation, storage and the page:

| # | Category | The session… |
| --- | --- | --- |
| 1 | `skipped-whole-workout` | was finished with no sets logged |
| 2 | `skipped-whole-exercise` | skipped at least one whole required exercise |
| 3 | `skipped-sets` | did every required exercise, but skipped some planned sets |
| 4 | `fully-completed` | logged every planned set of every required exercise |
| 5 | `fully-completed-with-improvements` | fully completed, and improved on at least one exercise |
| 6 | `fully-completed-with-improvements-on-every-exercise` | fully completed, and improved on every exercise with history |

The rules are checked in that order, and the lower category wins.

- **Optional exercises.** A skipped optional exercise never counts as skipping, but one that was
  done counts towards improvements.
- **Slots with no planned sets.** A required slot with no planned sets in the block is ignored.
- **Improvement.** An exercise improved when its best estimated 1RM (`estimatedOneRepMaxKg`, the
  formula the progress charts use) beats the best of the most recent previous finished session of
  the same exercise and variant. "Previous" means it finished before this session did, so a reload
  after later workouts keeps the category.
- **No history.** Sets without a weight have no estimate. Neither do sets over 12 reps, which is the
  estimate's own limit. An exercise without an estimate on either side counts as having no history,
  and it is neither improved nor counted against "every exercise".
- **No bodyweight rule** until the app has a bodyweight-exercise concept.

### A weekly set, replaced on success

The `onestopshop-jobs` Worker ([014](014-scheduled-jobs.md)) runs `runWeeklyAffirmations` daily at
03:00 UTC.

- **One set a week.** If the stored set was generated on or after this week's Monday 00:00 UTC, the
  job does nothing. Otherwise it asks Gemini for a new set. In a normal week that's one request, on
  Monday. A failed Monday is retried on Tuesday, and so on until it succeeds. The same check makes a
  repeated cron harmless.
- **Exactly 7 affirmations per category**, 42 in a set.
- **Replace on success.** A complete, valid set replaces the `affirmations` table in one D1 batch,
  which runs as one transaction: delete every row, then insert the new rows in chunks that stay
  under D1's 100 bound parameters. Every row of a set gets the same `generated_at`. A failed or
  invalid run changes nothing, so the page never sees an empty or half-written table because of
  it.
- **Global table, no `profile_id`.** This is a deliberate exception to the profile scoping used
  everywhere else. The affirmations are generic app content: nothing about any profile goes into
  the request or comes out of it.

### The page only reads

The finished page loads the previous bests, classifies the session and reads that category's lines
in `position` order. It shows line `n % 7`, where `n` counts the profile's sessions finished earlier
in the same week (Monday 00:00 UTC, from the session's own `finishedAt`). Up to 7 sessions a week
never repeat a line. A reload shows the same line, and nothing is written.

With no lines for the category, before the first successful run, or on any storage error, the page
shows a random fixed line from `fitnessStrings.finished.affirmations`. The fixed lines are never
removed.

### The request and its validation

The request is one `generateContent` call to `gemini-3.8-flash`. Its JSON response schema is
generated from the category list: one required array of strings per category id. The user message
is only *"Write this week's set."* The system prompt gives each category its definition, its tone
and example lines, and these rules:

- The energy rises with each category.
- Every affirmation stands alone: no numbers, weights, exercise names or claims beyond the category.
- No insults, never mock, and never guilt in the skipping categories.
- No medical, health, diet or body-shape claims.
- English, no hashtags, at most one emoji.

`parseAffirmationSet` checks the answer, category by category:

- **Each line** is trimmed, non-empty and on one line.
- **Word budget:** at most `affirmationMaxWords` (15) whitespace-separated words, with a
  120-character backstop so a line fits the finished screen's heading.
- **Duplicates,** within a category or across categories (case-insensitive), are dropped.
- **Count:** the first 7 valid lines are kept. A missing category, or one with fewer than 7 valid
  lines, makes the whole set invalid.

### Retries and the daily safety net

Each attempt has a 180 s timeout and 4096 output tokens. A run makes up to 3 attempts, with backoff
of 30 s and 60 s, about 10.5 minutes at worst, inside the 15-minute limit. The timeout started at
60 s, but a live local run on 2026-10-24 timed out on every attempt, and a success observed while
building 013 took about 145 s on Google's side. A fourth 180 s attempt would not fit in the
15 minutes.

| Outcome | Retry within the run? |
| --- | --- |
| Timeout, network error, HTTP 5xx | Yes |
| HTTP 429 | Yes, then give up until tomorrow's run. Never fixed by paying |
| An answer with an invalid or incomplete set, or an unexpected finish such as `MAX_TOKENS` | Yes |
| HTTP 400, 401, 403, 404, a blocked prompt, a safety finish | No. Give up until tomorrow's run |

A bad week costs at most 3 requests a day.

### Free tier and key rules, carried over from 013

- **Free tier only.** Only a model Google lists as free. The Google Cloud project behind the key has
  no billing account and is never upgraded. A used-up quota is an expected outcome, never a reason
  to pay. If the free tier goes away, the app stays on the fixed lines and the provider choice is
  revisited.
- **The key.** `GEMINI_API_KEY` is a secret of the jobs Worker only, which has no HTTP surface. The
  app Worker holds no Gemini configuration. Gemini is called only when `GEMINI_ENABLED` is exactly
  `true` and a key is present. The key travels in the `x-goog-api-key` header and is never logged:
  logs carry only a status code or a failure kind.
- **Nothing personal is sent.** The request holds only the category definitions and the prompt. No
  workout data, names or numbers.

## Consequences

- Nothing on the page waits on Google. The finished screen costs two small reads more than before:
  the previous bests and the week count.
- The first production set arrives at the first daily run after the merge and after the jobs
  Worker's secret is set. Until then the page shows fixed lines.
- Every user sees the same 42 lines in a week. The category and the week position decide which one.
- Migration 0013 only adds the `affirmations` table. The 013 columns
  `workout_sessions.affirmation` and `affirmation_requested_at` stayed in the schema, unread, for
  one deploy, and a separate deploy then took them out of the schema while they stayed in the
  database. CI applies migrations before the new app Worker is live, and the old app's Drizzle
  queries name every column. Dropping them in 0013 would have broken every session page for the
  length of the deploy, and for longer if the deploy step failed. Migration 0014 dropped them once
  the schema without them was live in production. The same order holds for a rollback: reverting
  the schema change after 0014 would break every session page.
