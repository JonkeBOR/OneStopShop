# 011 — Progress charts

**Status**: accepted
**Date**: 2026-10-21

## Context

Progress charts show bodyweight on the home screen and the estimated one-rep max of an exercise on
its page, with bands for the programs that were active when the sets were logged. A band needs the
program's name long after the program is gone, but deleting a program removed its row, so the name
was lost with it.

## Decision

### Programs are soft-deleted

Deleting a program turns its `programs` row into a tombstone: the row stays with its name and
`deleted_at` set to the time of the delete. The plan itself is deleted in the same batch: the
program's workouts (and through them slots, planned sets and parked weights), training blocks and
cycle. The active-program pointer is cleared and open sessions are finished, as before.

A program with `deleted_at` set is invisible to every program operation and reads as `not-found`.
Operations that reach a program through its blocks, workouts or slots need no extra condition,
because those rows no longer exist. Direct reads of `programs` filter on `deleted_at IS NULL`.

Program names are unique among a profile's live programs only, so the name of a deleted program can
be reused. An exercise used only in a deleted program is no longer in use and can be deleted.

Programs hard-deleted before this change are unrecoverable: their sessions and set logs keep a
program id that matches no row, and they get no band.

## Consequences

- History and progress views read `workout_sessions.program_id` and look the name up in `programs`
  including tombstones, and must expect ids with no row.
- The `programs` table grows by one row per deleted program, which is small for one user.
