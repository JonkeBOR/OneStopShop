# 009 — Exercise variants

**Status**: accepted
**Date**: 2026-10-20

## Context

The same exercise feels heavier on one gym's machine than another's, so a single last weight per
planned set is wrong half the time. The exercise should still occupy one slot in a workout with the
same sets and reps, but the remembered weight must follow the machine actually used. Gyms are mixed
and matched, so the choice is made per exercise, mid-session.

## Decision

### Variants belong to the exercise

`exercise_variants` rows belong to an `exercises` row and have a `removed_at` soft-delete flag. A
variant hits exactly the muscles of its exercise, so the weekly volume estimate
([008](008-weekly-volume-estimate.md)) is unchanged: a slot still counts once, for its exercise.
Only the last weight splits by variant; sets, reps, optional and periodized stay on the slot.

Names use the exercise-name rules and are unique, ignoring case, among an exercise's active
variants. A removed name can be reused. Variants are ordered by `created_at`, then `id`; the oldest
active one is the default for a new slot and the fallback when the selected one is removed.

### The selected variant lives on the planned sets

`planned_sets.variant_id` holds the slot's selected variant and `planned_sets.last_weight_grams`
holds that variant's weight, so every existing reader of last weights is unchanged. The other
variants' weights are parked in `planned_set_variant_weights`, keyed by planned set and variant.
Two invariants hold after every write:

1. All planned sets of a slot, in every block, carry the same `variant_id`.
2. A planned set never has a parked weight for its own `variant_id`, and parked weights are never
   null: no row means no weight.

`swapVariantStatements` in `server/variants.ts` performs the swap in one batch: park the current
weights, load the target's weights and variant, delete the target's parked rows.

### Adding a variant

Adding the first active variant (the exercise has none, which includes one whose variants were all
removed) only stamps `variant_id` onto the exercise's planned sets. The weights stay where they are,
so they become that variant's weights. Adding a later variant changes nothing else and starts
without weights.

### Removing a variant

Removal is a retire (soft delete) when `set_logs` reference the variant, so history can still name
it, and a hard delete otherwise. Either way the variant's parked weights are deleted and the slot
falls back to the oldest remaining active variant, loading its parked weights. With none left, the
slot has no variant and no weights.

### Switching is locked once a set is logged

A switch is made in an in-progress session, writes immediately and applies to every block of the
slot. It is refused with `variant-locked` once any set of that slot is logged in the session.

Because a set log is immutable, logging a set sends the variant the page shows for its slot, and a
mismatch with the planned set's current variant (a switch in flight or in another tab) is refused
with `variant-changed`, writing nothing, so a weight is never recorded against the wrong variant.
A log request without the key is accepted as before, which keeps a page opened before a deploy
working.

### `set_logs.variant_id` has no foreign key

Each logged set records its variant, nullable for sets logged before variants existed or for an
exercise without any. `set_logs` is immutable through triggers, and adding a foreign key would make
drizzle-kit rebuild the table, which drops the triggers. Like the table's other context columns, it
is a plain column.

## Consequences

- Weekly volume needs no change.
- Planned sets with one parked-weight row per other variant grow with variants times sets, which is
  small for one user.
- drizzle-kit's SQLite `ADD COLUMN` cannot emit `ON DELETE`, so the database has NO ACTION on
  `planned_sets.variant_id` while the schema and snapshot say `restrict`. The code always repoints
  planned sets before deleting a variant, so this is harmless today. A future rebuild of
  `planned_sets` would make it RESTRICT.
- History and progress views, when built, read `set_logs.variant_id` and must expect retired
  variants, and the database does not guarantee the id matches a row.
- Renaming variants, switching outside a session and per-gym "switch all" shortcuts do not exist.
