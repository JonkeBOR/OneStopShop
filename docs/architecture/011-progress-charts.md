# 011 — Progress charts

**Status**: accepted
**Date**: 2026-10-21

## Context

Progress charts show bodyweight on the home screen and, on an exercise's page, each session's
heaviest weight or its best estimated one-rep max, with bands for the programs that were active when the sets were logged. A band needs the
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

### Recharts

The charts are drawn with Recharts 3 (`recharts` 3.10.1, with its `react-is` 19 peer). The user
chose it. One small Client Component, `ProgressLineChart`, wraps it, because Recharts needs the
client. It takes points, a time domain and program bands as props that the Server Component has
already calculated in `domain/progress-chart.ts`, does no maths of its own, and calls no `/api/*`
route. The measure, range and variant dropdowns (`ChartFilters`) are native `<select>`s that navigate to the
chosen search parameters, so iOS opens its own full-width picker and the server still builds the
chart. They and the program legend (`ProgramLegend`) are the app's own markup, so their text stays
in the strings module. Recharts' `Legend` is
not used, because it describes data series rather than reference areas.

The date axis gets explicit `ticks` from `axisTicks`: up to five whole days, evenly spaced, from the
first day of the domain to the last, with `interval="preserveStartEnd"` dropping middle labels that
would collide. Without them Recharts treats a line chart's number-typed X axis as categorical and,
on a `time` scale, puts one tick on every data point, so a few close weigh-ins stack their labels.
The 3-month and 1-year ranges run from the range start to today; everything runs from the first
recorded date to the last. The tooltip gives a point's exact date.

Animations are off (`isAnimationActive={false}`): a history chart that draws itself on every visit
feels slow on the phone. A tooltip with the date and the kg value is the only interaction.

Colours come from the `--color-chart-*` and `--color-program-band-*` tokens, through CSS Module
classes passed as `className` to Recharts elements, never through hex values or `var()` in SVG
attributes. A CSS rule overrides the presentation attributes Recharts sets (`stroke="#3182bd"`,
`fill="#ccc"`). Recharts 3 portals dots, tick labels and the active dot into z-index layers outside
their element's group, so those get their own classes (`dot`, `activeDot`) or are selected from the
figure. This was checked in WebKit with the iPhone profile, in light and dark.

`scripts/bundle.ps1` on 2026-10-21: 7.30 MiB of 64 MiB and 47.5 ms of 1000 ms startup with the
dependency installed but not yet used by a page, and 7.94 MiB and 23.4 ms with a page rendering
`ProgressLineChart`. Recharts adds about 0.64 MiB to the Worker. The startup figure is noisy run to
run and stays far inside the limit.

## Consequences

- History and progress views read `workout_sessions.program_id` and look the name up in `programs`
  including tombstones, and must expect ids with no row.
- The `programs` table grows by one row per deleted program, which is small for one user.
- A new chart reuses `ProgressLineChart` and colours itself through tokens and classes. Recharts
  measures no size in jsdom, so `ProgressLineChart` passes `initialDimension` to give it a size to
  render at; component tests stub `ResizeObserver` and only check that the figure renders, and the
  chart itself is seen in Playwright.
