# 012 — Every exercise has a variant

**Status**: accepted
**Date**: 2026-10-23

## Context

[009](009-exercise-variants.md) let an exercise exist without variants. Sets logged in that state
carry `set_logs.variant_id = NULL`, and the exercise progress chart lumped them into a "No variant"
series that says nothing about where they were done. Stamping the first variant onto those logs when
it is created would mean the app itself rewriting `set_logs`, which triggers make immutable, so a
runtime backfill was rejected. Giving every exercise a variant from the start removes the null case,
so one migration can fill in the history and nothing has to rewrite logged sets again.

## Decision

### An exercise is created with a `Default` variant

`addExercise` inserts the exercise and a variant named `Default` (`defaultVariantName` in
`domain/variant.ts`) in one batch, with the exercise's `created_at`. The name is data, not UI copy,
so it is not in `src/lib/strings/`. The default is not flagged: the oldest active variant already is
the default and the fallback, as in 009, and the `Default` variant is an ordinary variant once
created.

### Variants can be renamed

`renameVariant` follows the exercise-name rules and requires the name to be unique, ignoring case,
among the exercise's other active variants. A change of case alone is allowed. A retired variant
cannot be renamed. The route is `PATCH /api/fitness/exercises/[id]/variants/[variantId]`.

### The last active variant cannot be removed

`removeVariant` refuses the last active variant with `last-variant` (409), which `useFitnessAction`
treats as a stale view. Otherwise removal stays as in 009: a retire when `set_logs` reference the
variant, a hard delete when none do. The edit page lists every active variant, a lone `Default`
included, as a rename row, and shows no remove button on a lone one.

### Adding a variant never moves weights

009's rule that adding the first variant stamps `variant_id` onto the planned sets is gone, because
no exercise is without a variant. `addVariant` only inserts, and the first-variant confirmation was
removed with it.

### The migration

`migrations/0011_default_variants.sql` runs once on deploy:

1. Every exercise without an active variant gets a `Default` variant, which includes an exercise
   whose variants were all retired. Its ids are `lower(hex(randomblob(16)))` and its `created_at` is
   the migration time.
2. Every planned set without a variant gets its exercise's oldest active variant. Its last weight
   stays and becomes that variant's weight.
3. The `set_logs_no_update` trigger is dropped, every set log without a variant gets its exercise's
   oldest variant, retired or not, and the trigger is recreated exactly as in
   `0001_set_log_immutability.sql`.

An exercise with only retired variants therefore sends its unassigned logs to its oldest retired
variant, which matches "the first variant created for that exercise".

### A lone variant stays out of the way

The session's `SessionSlot.hasVariantChoice` is true only with two or more active variants. The card
shows the variant name and the options link only then, and the slot picker page is not found with
fewer than two active variants.

The chart drops the "No variant" series and its `none` URL value, and a log without a variant is not
charted. It offers a variant choice only when two or more variants have points in range, as before.
Each `RecordedVariant` carries `isRetired`, and a retired variant's choice reads "`<name>`
(deleted)", so its history stays visible.

## Consequences

- `planned_sets.variant_id` and `set_logs.variant_id` stay nullable. Making either NOT NULL needs a
  table rebuild, and rebuilding `set_logs` drops its immutability triggers.
- `logSet` still accepts a null variant, but a session page opened before the deploy for a formerly
  variant-less exercise sends `variantId: null` against a planned set that now carries `Default`.
  `logSet` refuses that log with `variant-changed`, writes nothing, and the page refreshes, so the
  next log works. That is one refusal after the deploy.
- The null case of `fallbackVariantId` is unreachable, because an exercise always has an active
  variant to fall back to and the last one cannot be removed. It stays as a total function.
- Between the CI migration step and the Worker deploy, the old Worker could still create an exercise
  without a variant. That is negligible for one user and matters only if the columns are ever made
  NOT NULL.
- Switching outside a session, per-gym "switch all" shortcuts and history views still do not exist.
