# 008 — The weekly volume estimate

**Status**: accepted
**Date**: 2026-10-19

## Context

Exercises can be linked to the body parts they train. The program screen should answer "does this
program train every muscle enough?" without the user entering anything beyond the program itself
and those links. That needs a rule for turning a program into sets per body part per week, and a
rule for what counts as enough.

## Decision

### A week is one pass through the workouts

Every workout of the program counts once. There is no sessions-per-week setting, so a program whose
workouts run twice a week reads as half its real volume.

### Sets are weighted by the link's role

A link between an exercise and a body part is **primary** or **secondary**. One planned set counts
1 toward each primary body part and 0.5 toward each secondary one. Links made before roles existed
are primary. For a chosen block, a slot contributes the number of planned sets in its prescription
for that block. A non-periodized slot stores its one scheme in every block, so it needs no special
case.

### Optional exercises are left out

Only non-optional slots count, so the estimate is the guaranteed minimum rather than the best case.

### Fixed bands, the same for every body part

| Weekly sets | Level     |
| ----------- | --------- |
| 0           | none      |
| under 10    | low       |
| 10 to 20    | on target |
| over 20     | high      |

The rules are pure functions in `domain/volume.ts`. The program screen computes them in a Server
Component for every block and the client only picks which block to show.

## Consequences

- Programs that run each workout more or less than once a week are misread until a sessions-per-week
  setting exists.
- Small muscles that need fewer sets, and large ones that tolerate more, share one band until bands
  per body part exist.
- Primary and secondary is a coarse model. A finer score per link, such as 0–10, would replace the
  role and the weights, not sit beside them.
