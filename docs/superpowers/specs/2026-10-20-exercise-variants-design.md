# Exercise variants — design

**Date:** 2026-10-20
**Status:** decided in conversation, written up for the plan

## Why

The user trains at 4–5 gyms. The same exercise ("Machine row") feels heavier on one gym's machine than
another's, so one "last weight" per set is wrong half the time. The exercise should still occupy one
slot in a workout, with the same sets and reps, but the remembered weight must follow the machine
actually used. Gyms are mixed and matched, so the choice is made per exercise, mid-session, not once
per gym.

## Decisions (the user's)

1. **Variants belong to the exercise.** An exercise has zero or more variants. A variant hits exactly
   the muscles of its exercise, so the weekly volume estimate does not change: a slot still counts
   once, for its exercise.
2. **Only the last weight splits by variant.** Sets, reps, optional and periodized stay on the slot.
3. **The selected variant is stored on `planned_sets`.** When a session opens, each exercise shows the
   variant last used for that slot. Switching the variant in a session writes the choice immediately,
   so leaving the session (for example to the fitness tracker home page) and coming back shows the
   same variant, and so does next week's session.
4. **Switching is locked once a set is logged.** In an active session, after any set of that exercise
   has been logged, its variant cannot be switched for the rest of that session.
5. **Variants are managed on the exercise edit screen.**
6. **Adding the first variant transfers the existing last weights onto it,** after a confirmation
   popup that explains the transfer. Adding any later variant transfers nothing; it starts without
   weights.
7. **Removing a variant:**
   - if sets were logged with it, it is soft-deleted: a flag hides it everywhere except history and
     log views;
   - if no sets were logged with it, it is hard-deleted;
   - either way, its last weights on planned sets are hard-deleted.

## Calls made while writing this up (check these)

- **"Last used for the slot" spans blocks.** All of a slot's planned sets, in every block, carry the
  same selected variant. Switching updates every block, and new planned sets inherit it.
- **The selected variant's weight stays in `planned_sets.last_weight_grams`.** The other variants'
  weights are parked in a new table, `planned_set_variant_weights`. Switching parks the current
  weights and loads the target's. This keeps every existing reader of last weights (session
  prefill, slot edit, periodization carry) unchanged, and makes the first-variant transfer a simple
  matter of stamping the variant on the planned sets — the weights do not move.
- **Each logged set records its variant** (`set_logs.variant_id`, nullable; sets logged before
  variants existed, or for an exercise without variants, have none).
- **When the selected variant is removed,** the slot falls back to the oldest remaining variant
  and loads that variant's parked weights. If none remains, the slot has no variant and no weights.
- **"First variant" means "the exercise has no active variants".** That also covers an exercise
  whose variants were all removed.
- **Variant names** follow the exercise-name rules (required, length limit) and are unique,
  ignoring case, among an exercise's active variants. A removed name can be reused.
- **Variants are ordered by when they were added.** The oldest one is the default for a newly
  added slot, for a replaced exercise, and for the fallback.
- **A new slot, or a slot whose exercise is replaced,** starts on the exercise's oldest active
  variant with no weights.
- **The picker shows whenever the exercise has at least one active variant,** even if it has only one,
  so the session says which gym's numbers are shown.
- **Switching a variant clears the weights typed but not yet logged in that exercise's rows.** They
  belonged to the other machine. Reps drafts are kept.
- **Periodization changes treat parked weights like the selected variant's:** turning periodization
  on clears them all, turning it off carries each variant's most recent weight per set into every
  block.
- **No renaming of variants,** and no switching outside a session. Neither was asked for.
- **Copy** for the new labels, confirmations and the lock error is drafted in the plan.

## Out of scope

History and progress views (not built yet; they will read `set_logs.variant_id` and may show removed
variants), renaming variants, picking a variant from the slot edit screen, and per-gym "switch all"
shortcuts.
