# Weekly volume per body part on the program screen

## Context

Exercises can be linked to the body parts they train (`feature/exercise-muscle-mapping`). The next
step answers "does this program train every muscle enough?". It adds a read-only `AnatomyChart` to
`ProgramEditScreen` that estimates each body part's weekly set volume from the program's workouts,
coloured by whether that is enough.

**Branching:** merge the muscle-mapping PR first, then branch `feature/program-volume` from `main`.
This feature changes the link row and the chart introduced there.

## Decisions

- **A week is one pass through the workouts.** Each workout counts once. There is no
  sessions-per-week setting.
- **Links are primary or secondary.** A set counts 1 toward a primary body part and 0.5 toward a
  secondary one. On the exercise chart, taps cycle off → primary → secondary → off. Existing links
  become primary.
- **The bands are fixed and the same for every body part.** 0 sets is none, under 10 is low, 10–20
  is on target, and over 20 is high.
- **A block picker selects the block,** starting on the cycle's current block.
- **Optional exercises are excluded,** so the estimate is the guaranteed minimum.
- **Colours:** grey (none), amber (low), green (on target), red (high). A legend and a numbers
  list go with the chart, so colour is never the only signal.

## 1. Domain

`domain/body-part.ts`:

- `bodyPartRoles = ['primary', 'secondary'] as const`, `BodyPartRole`, `isBodyPartRole`.
- `BodyPartLink = { bodyPart: BodyPart; role: BodyPartRole }`.

`domain/types.ts`: `ExerciseUsage.bodyParts` becomes `BodyPartLink[]`.

New `domain/volume.ts` (pure, with `volume.test.ts`):

- `setWeights: Record<BodyPartRole, number> = { primary: 1, secondary: 0.5 }`.
- `volumeBands = { low: 10, high: 20 }` and
  `volumeLevel(sets): 'none' | 'low' | 'target' | 'high'`: 0 → none, under 10 → low,
  10–20 → target, over 20 → high.
- `weeklyVolume(workouts: WorkoutView[], blockId, linksByExercise: ReadonlyMap<string, BodyPartLink[]>): Record<BodyPart, number>`.
  It walks the non-optional slots. For each one, it multiplies the number of planned sets in the
  slot's prescription for `blockId` by the role weight, and adds that to every body part linked to
  the exercise. Unlinked body parts get 0. Non-periodized slots already store their one scheme in
  every block, so they need no special case.

## 2. Persistence

- `schema.ts`: add `exerciseBodyParts.role` as
  `text('role', { enum: bodyPartRoles }).notNull().default('primary')`.
- Generate `0008_body_part_roles.sql` with `drizzle-kit generate --name body_part_roles`. This is an
  `ALTER TABLE … ADD COLUMN … DEFAULT 'primary'`, so existing links become primary.
- `server/body-parts.ts`:
  - `linkBodyPart(db, profileId, exerciseId, bodyPart, role)` upserts with
    `onConflictDoUpdate({ set: { role } })`.
  - New `listProgramBodyPartLinks(db, profileId, programId): Promise<Map<string, BodyPartLink[]>>`,
    keyed by exercise id. It joins `exercise_body_parts` → `exercise_slots` → `workouts` →
    `programs` and is scoped by `programs.profileId`.
- `getExerciseUsage` returns `{ bodyPart, role }` pairs, still in chart order through
  `inChartOrder`.

## 3. HTTP

`PUT /api/fitness/exercises/[id]/body-parts/[bodyPart]` takes a body `{ role }`.
`handleLinkBodyPart` reads it with `readJson` and checks it with `isBodyPartRole`. A missing or
invalid role gets 400 `invalid-body`. `DELETE` is unchanged.

## 4. Chart and exercise editor

`components/AnatomyChart.tsx`: replace `selected: BodyPart[]` with
`highlights: Partial<Record<BodyPart, Highlight>>`, where
`Highlight = 'primary' | 'secondary' | 'low' | 'target' | 'high'`. Each highlight is a CSS Module
class. A part without a highlight stays the plain muscle grey.

- **Interactive mode:** `aria-checked` is true for any link. The role goes in an `aria-description`
  taken from the strings ("Primary" / "Secondary"). The accessible name stays the body part's name.
- **Read-only mode:** gains an optional `label` prop that names the `img`.

New tokens in `src/app/globals.css`, each re-declared for dark mode:

- `--color-anatomy-secondary`, a lighter red.
- `--color-volume-low` (amber), `--color-volume-target` (green) and `--color-volume-high` (red).

The five existing `--color-anatomy-*` tokens stay exactly as they are.

`useBodyPartToggles` becomes `useBodyPartLinks`:

- Its state is `Partial<Record<BodyPart, BodyPartRole>>`.
- A tap moves a body part one step: none → `PUT { role: 'primary' }` → `PUT { role: 'secondary' }`
  → `DELETE`.
- These stay as they are now:
  - the chart updates immediately and reverts if saving fails;
  - an inline error is shown;
  - a second tap on a body part is ignored while its request is in flight.

## 5. Program screen

- `programs/[programId]/page.tsx`: load `listProgramBodyPartLinks` and `listBodyParts` in
  parallel with the existing reads.
- `ProgramEditScreen.tsx` (a Server Component): compute
  `volumes = program.blocks.map((block) => ({ block, sets: weeklyVolume(program.workouts, block.id, links) }))`.
  Render a "Weekly volume" section between Blocks and Workouts, only when the program has workouts.
- New client component `components/ProgramVolume.tsx` (with a CSS Module) receives `volumes`,
  `bodyParts` and `currentBlockId`, and renders:
  - a labelled block `<select>`, starting on the current block and hidden when there is only one
    block;
  - a read-only `AnatomyChart` whose `highlights` come from `volumeLevel`;
  - a legend: four swatches, each with its label;
  - a list sorted by sets, such as "Chest — 12 sets · On target", with half sets shown as "1.5".
- Strings in `src/lib/strings/fitness.ts` under `programVolume`: the heading, the block label, the
  level names and `setCount(n)`.

## 6. Tests

Write the acceptance test first, then work red-green through each layer.

1. **E2E, written first:** `e2e/program-volume.spec.ts`.
   - Set up a program with one block, one workout and a 4-set exercise.
   - Make chest primary (one tap) and triceps secondary (two taps).
   - The program page lists "Chest — 4 sets · Low" and "Triceps — 2 sets · Low".
   - Also update `e2e/exercise-muscles.spec.ts` for the three-tap cycle.
2. **Volume rules (`volume.test.ts`):**
   - primary counts 1, secondary 0.5, and workouts add up;
   - optional slots are excluded;
   - the selected block's prescription is the one counted;
   - the band edges at 0, 9.5, 10, 20 and 20.5 fall in the right level.
3. **Storage:**
   - a link created before the role column reads as primary;
   - linking again with a new role updates it;
   - `listProgramBodyPartLinks` is scoped to the profile and covers every workout.
4. **Handlers:** PUT without a body or with an invalid role gets 400; PUT with a valid role gets 200.
5. **DOM:**
   - `AnatomyChart`: each highlight gets its class, and the role description is set;
   - `ExerciseEditScreen`: the tap cycle sends PUT primary, PUT secondary, then DELETE;
   - `ProgramVolume`: starts on the current block, switching block changes the list, and every
     level is labelled.

## 7. Docs

- Add `docs/architecture/008-weekly-volume-estimate.md`, recording:
  - a week is one pass through the workouts;
  - sets are weighted 1 for primary and 0.5 for secondary;
  - the 10/20 bands;
  - optional exercises are excluded.
- Update the project-state section of `CLAUDE.md`.

## Verification

- `scripts/check.ps1` exits 0, and `scripts/e2e.ps1` passes, including the new spec.
- Screenshots in light and dark mode:
  - On the program chart, amber, green and red appear where they should, and the block picker
    switches between blocks.
  - On the exercise chart, primary is red and secondary is a lighter red, and the role survives a
    reload.
  - The existing grey, white and red chart colours are unchanged.

## Later

- A sessions-per-week setting, for programs whose workouts don't each run once a week.
- Separate bands for each body part.
- The full 0–10 scoring model on the exercise–body part link, which would replace
  primary/secondary.
