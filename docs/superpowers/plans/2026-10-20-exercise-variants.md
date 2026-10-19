# Exercise Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An exercise can have variants (one per gym or machine). A slot remembers which variant was
last used and keeps separate last weights per variant. The variant can be switched mid-session until
a set of that exercise is logged.

**Architecture:** A new `exercise_variants` table belongs to `exercises`. `planned_sets.variant_id`
holds the slot's selected variant, and `planned_sets.last_weight_grams` keeps holding **the selected
variant's** weight. The other variants' weights are parked in `planned_set_variant_weights`.
Switching parks the current weights and loads the target's in one batch. Every existing reader of
last weights therefore stays unchanged, and adding the first variant only stamps `variant_id` on the
planned sets. `set_logs.variant_id` records what each set was done on. The weekly volume is
untouched.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Drizzle ORM 0.45 / drizzle-kit 0.31 on
Cloudflare D1, Vitest (`node`, `dom`, `storage` projects), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-exercise-variants-design.md`

## Global Constraints

- Work on a branch, `exercise-variants`, never on `main`. Merging to `main` deploys.
- No comments in code. No bare strings in JSX; all text goes in `src/lib/strings/fitness.ts`. No
  inline CSS; use CSS Modules with design tokens (`docs/01`, `docs/05`).
- Schema changes go through `npx drizzle-kit generate --name exercise_variants`. Never hand-edit the
  generated SQL (`docs/architecture/006`).
- `set_logs` is immutable (triggers in `0001`). The migration must not rebuild `set_logs`, because a
  rebuild drops the triggers. `set_logs.variant_id` therefore has **no** foreign key, like the
  table's other context columns.
- Operations take `db: Database` first, return `Result<T, E>`, filter by `profileId`, and treat
  another profile's ids as `not-found`. A refused operation writes nothing. Multi-statement writes
  go through `runBatch`.
- Invariant 1: all planned sets of a slot, in every block, carry the same `variant_id`.
- Invariant 2: a planned set never has a parked weight for its own `variant_id`, and parked
  weights are never null (no row = no weight).
- Variants are ordered by `created_at`, then `id`. "Oldest active variant" is the default and the
  fallback.
- Variant names use `parseName` and `exerciseNameKey`. They are unique among an exercise's active
  (not removed) variants, and a removed name can be reused.
- Storage tests: stop the dev server on port 3000 first, and never run two Vitest invocations at once
  (test skill).
- Every task ends with `pwsh -NoProfile -File scripts/check.ps1` exiting 0 before it commits. Every
  commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Round trip A → B → A** restores A's weights exactly, per set and per block, and a null weight
   never becomes a parked row. _(Task 4)_
2. **Removing the selected variant** falls back to the oldest remaining variant with _its_ parked
   weights. Removing the last one leaves the slot with no variant and no weights, and the next add is
   a "first variant" again. _(Task 3)_
3. **Non-periodized slots** keep every variant's weights in every block. That covers adding a block
   (parked weights are copied too) and turning periodization off (each variant's most recent weight
   per set is carried). _(Task 5)_
4. **Another profile's ids** for session, slot, exercise or variant answer `not-found` and write
   nothing. _(Tasks 3, 4)_
5. **Enter in the variant name field** with the first-variant confirmation pending must not post
   without the confirmation. _(Task 7)_

---

### Task 1: Acceptance test, written first

**Files:**

- Create: `e2e/exercise-variants.spec.ts`
- Modify: `src/lib/strings/fitness.ts`, adding the UI copy now so that the test fails on behaviour
  and not on a missing key

**Interfaces:**

- Produces the strings that Tasks 7 and 8 render, as copy:

  ```ts
  exerciseEdit.variants: {
    heading: 'Variants',
    empty: 'No variants. Add one for each gym or machine whose weights differ.',
    nameLabel: 'New variant name',
    add: 'Add variant',
    firstConfirm: 'The last weights already recorded for this exercise will move to this variant.',
    firstConfirmLabel: 'Add variant',
    remove: (name: string) => `Remove ${name}`,
    removeConfirm: 'Last weights for this variant will be deleted.',
    removeConfirmLabel: 'Remove',
  },
  session.variantLabel: (exerciseName: string) => `Variant, ${exerciseName}`,
  ```

- [ ] **Step 1: Write the test** `'an exercise keeps separate last weights per variant, switchable until a set is logged'`,
      modelled on `e2e/periodization.spec.ts` (same `signIn`, program creation and `openBlockWorkout`
      helper). Use one program with 2 blocks, one workout, and one **non-periodized** slot of 1 set × 10
      for a new exercise `Row ${run}`. Activate it.
  1. Block 1: log weight `40` and finish.
  2. Open `/fitness-tracker/exercises`, then the exercise. Add variant `Gym A`. Expect the dialog
     text `firstConfirm`, then click `firstConfirmLabel`. Add `Gym B`. Expect no dialog, and both
     names listed under the `heading` region.
  3. Block 2: the `variantLabel` combobox has `Gym A` selected and the weight placeholder is `40`.
     Select `Gym B`. The placeholder becomes empty (`toHaveAttribute('placeholder', '')`).
  4. `page.goto('/fitness-tracker')` and back to the same session URL. `Gym B` is still selected.
  5. Log `30`. The combobox `toBeDisabled()`. Finish. The program starts a new pass at block 1.
  6. Exercise edit: click `remove('Gym B')`, then `removeConfirmLabel`. `Gym B` is no longer listed.
  7. Block 1 (new pass): `Gym A` is selected and the placeholder is `40`.
- [ ] **Step 2: Confirm it fails** — Run `pwsh -NoProfile -File scripts/e2e.ps1 -Path e2e/exercise-variants.spec.ts`.
      Expected: exit 1, failing at step 2 because the exercise edit screen has no variants section.
- [ ] **Step 3: Gate and commit** — `check.ps1` exits 0 (it does not run Playwright), then commit with the message `Add the exercise variants acceptance test`.

---

### Task 2: Pure rules and the new error code

**Files:**

- Create: `src/features/fitness-tracker/domain/variant.ts`, `src/features/fitness-tracker/domain/variant.test.ts`
- Modify: `src/features/fitness-tracker/domain/program.ts` (`PlannedSetDraft`, `draftsForNewBlock`), `src/features/fitness-tracker/domain/program.test.ts`
- Modify: `src/features/fitness-tracker/domain/errors.ts`, `src/lib/strings/fitness.ts` (`fitnessErrorStrings`), `src/features/fitness-tracker/components/useFitnessAction.ts`

**Interfaces:**

- Produces:

  ```ts
  export type ParkedWeight = { variantId: string; lastWeightGrams: number };
  export type VariantSwitchDecision = { kind: 'switch' } | { kind: 'unchanged' };
  export function decideVariantSwitch(input: {
    sessionStatus: SessionStatus;
    loggedSetsInSlot: number;
    currentVariantId: string | null;
    targetVariantId: string;
    activeVariantIds: readonly string[];
  }): Result<VariantSwitchDecision, 'session-not-in-progress' | 'not-found' | 'variant-locked'>;
  export function fallbackVariantId(
    activeIdsOldestFirst: readonly string[],
    removedId: string,
  ): string | null;
  export function removalOf(hasSetLogs: boolean): 'retire' | 'delete';
  ```

  `PlannedSetDraft` gains `variantId?: string | null` and `parkedWeights?: readonly ParkedWeight[]`.
  `draftsForNewBlock` slot entries gain `variantId?: string | null` and
  `parkedWeightsBySet?: readonly (readonly ParkedWeight[])[]` (index = set number − 1). They are
  copied onto the drafts like `lastWeightsGrams`.
  Error code `'variant-locked'` (HTTP 409 by the existing default).

- [ ] **Step 1: Write the failing tests** in `variant.test.ts`:
  ```ts
  test('refuses a switch outside an in-progress session', () =>
    expect(
      decideVariantSwitch({
        sessionStatus: 'finished',
        loggedSetsInSlot: 0,
        currentVariantId: 'a',
        targetVariantId: 'b',
        activeVariantIds: ['a', 'b'],
      }),
    ).toEqual(fail('session-not-in-progress')));
  test('refuses a variant that is not active on the exercise', ...toEqual(fail('not-found'))); // target 'x'
  test(
    'choosing the current variant changes nothing, even when locked',
    ...toEqual(succeed({ kind: 'unchanged' })),
  ); // logged 2, target 'a'
  test('locks once a set of the slot is logged', ...toEqual(fail('variant-locked'))); // logged 1, target 'b'
  test('switches otherwise', ...toEqual(succeed({ kind: 'switch' })));
  test('falls back to the oldest remaining variant', () =>
    expect(fallbackVariantId(['a', 'b', 'c'], 'a')).toBe('b'));
  test('has no fallback when the last variant goes', () =>
    expect(fallbackVariantId(['a'], 'a')).toBeNull());
  test('retires a variant with logged sets and deletes one without', () => {
    expect(removalOf(true)).toBe('retire');
    expect(removalOf(false)).toBe('delete');
  });
  ```
  In `program.test.ts`: `draftsForNewBlock` copies `variantId` to every draft of the slot and
  `parkedWeightsBySet[i]` to set `i + 1`. A slot without them gets `variantId: null` and
  `parkedWeights: []`.
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project node src/features/fitness-tracker/domain`. Expected: FAIL, `decideVariantSwitch` is not exported.
- [ ] **Step 3: Implement** the three functions in `variant.ts`, with checks in the order the tests
      list. Extend `PlannedSetDraft` and `draftsForNewBlock`. Add `'variant-locked'` to
      `fitnessErrorCodes` and to `fitnessErrorStrings` with the text
      `'A set is already logged for this exercise, so its variant cannot be changed in this workout.'`.
      Add it to `staleViewCodes` in `useFitnessAction.ts` so that the session refreshes into its locked
      state.
- [ ] **Step 4: Run them and see them pass** — same command. Expected: PASS.
- [ ] **Step 5: Gate and commit** — `pwsh -NoProfile -File scripts/check.ps1` exits 0, then commit with the message `Add pure rules for exercise variants`.

---

### Task 3: Schema, migration and the variant catalog

**Files:**

- Modify: `src/features/fitness-tracker/server/schema.ts`
- Create (generated): `migrations/0009_exercise_variants.sql`, `migrations/meta/*`
- Create: `src/features/fitness-tracker/server/variants.ts`, `src/features/fitness-tracker/server/variants.storage.test.ts`
- Modify: `src/features/fitness-tracker/server/mapping.ts`, `src/features/fitness-tracker/domain/types.ts`, `src/features/fitness-tracker/server/exercises.ts` (`getExerciseUsage`), `src/features/fitness-tracker/server/exercises.storage.test.ts`
- Modify: `src/features/fitness-tracker/components/test-fixtures.ts` and any test building a `SetLog` or `ExerciseUsage` literal. Give them `variantId: null` and `variants: []` so the typecheck stays green

**Interfaces:**

- Consumes: `fallbackVariantId`, `removalOf`, `ParkedWeight` (Task 2).
- Produces:

  ```ts
  export const exerciseVariants = sqliteTable(
    'exercise_variants',
    {
      id: text('id').primaryKey(),
      exerciseId: text('exercise_id')
        .notNull()
        .references(() => exercises.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      nameKey: text('name_key').notNull(),
      createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
      removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
    },
    (table) => [index('exercise_variants_exercise').on(table.exerciseId)],
  );
  export const plannedSetVariantWeights = sqliteTable(
    'planned_set_variant_weights',
    {
      plannedSetId: text('planned_set_id')
        .notNull()
        .references(() => plannedSets.id, { onDelete: 'cascade' }),
      variantId: text('variant_id')
        .notNull()
        .references(() => exerciseVariants.id, { onDelete: 'cascade' }),
      lastWeightGrams: integer('last_weight_grams').notNull(),
    },
    (table) => [primaryKey({ columns: [table.plannedSetId, table.variantId] })],
  );
  // plannedSets gains:  variantId: text('variant_id').references((): AnySQLiteColumn => exerciseVariants.id, { onDelete: 'restrict' })
  // setLogs gains:      variantId: text('variant_id')            -- no reference, see Global Constraints
  ```

  `domain/types.ts`: `export type ExerciseVariant = { id: string; name: string };`.
  `ExerciseUsage` gains `variants: ExerciseVariant[]` (active only, oldest first).
  `SetLog` gains `variantId: string | null`, mapped in `toSetLog`. `toExerciseVariant(row)` goes in
  `mapping.ts`.
  `server/variants.ts`:

  ```ts
  export async function listActiveVariants(
    db: Database,
    exerciseIds: readonly string[],
  ): Promise<Map<string, ExerciseVariant[]>>;
  export async function addVariant(
    db: Database,
    profileId: string,
    exerciseId: string,
    input: { name: string },
    now: Date,
  ): Promise<
    Result<ExerciseVariant, 'name-required' | 'name-too-long' | 'name-taken' | 'not-found'>
  >;
  export async function removeVariant(
    db: Database,
    profileId: string,
    exerciseId: string,
    variantId: string,
    now: Date,
  ): Promise<Result<{ removal: 'retire' | 'delete' }, 'not-found'>>;
  export function swapVariantStatements(
    db: Database,
    scope: SQL,
    toVariantId: string | null,
    options: { parkCurrent: boolean },
  ): Statement[];
  ```

- [ ] **Step 1: Add the schema** above, then run `npx drizzle-kit generate --name exercise_variants`.
      Open the SQL. It must create the two tables and index and add the two columns. It must **not**
      contain `__new_set_logs`. A rebuild of `planned_sets` is acceptable; `0004` did the same.
- [ ] **Step 2: Write the failing storage tests** in `variants.storage.test.ts` (same harness as
      `training.storage.test.ts`). Build the program with `createProgramFromSpec`. Seed last weights by
      logging sets through `startWorkout` + `logSet`, or with a direct `db.update(plannedSets)`.
  - `adding the first variant keeps the slot's last weights and selects it on every planned set of every slot of that exercise`.
    Assert that `planned_sets.variant_id` equals the new id across both blocks, and that
    `last_weight_grams` is unchanged.
  - `adding a second variant leaves the selection and weights alone`.
  - `refuses a name already used by an active variant of the exercise, ignoring case` → `fail('name-taken')`.
    `a removed variant's name can be used again` → ok.
  - `removing a variant with logged sets retires it and hides it from listActiveVariants`. Assert that
    `removedAt` is set and the row still exists.
  - `removing a variant without logged sets deletes it`. The row is gone.
  - Review Focus 2: `removing the selected variant falls back to the oldest remaining variant and its parked weights`.
    Seed A selected with 40 kg and B parked with 30 kg. Remove A. Planned sets now have
    `variant_id` B and 30 kg, B's parked rows are gone, and no parked rows for A remain.
  - Review Focus 2: `removing the last variant leaves the slot without a variant or weights, and the next add transfers again`.
  - Review Focus 4: `another profile's exercise or variant is not-found and nothing changes` for
    both `addVariant` and `removeVariant`.
  - In `exercises.storage.test.ts`: `getExerciseUsage lists active variants oldest first`.
- [ ] **Step 3: Run them and see them fail** — `npx vitest run --project storage src/features/fitness-tracker/server/variants`. Expected: FAIL, `addVariant` is not exported.
- [ ] **Step 4: Implement `server/variants.ts`.**
  - `addVariant` checks that the exercise belongs to the profile and the name is free among active
    variants. If the exercise has **no active variants**, it batches the insert with
    `UPDATE planned_sets SET variant_id = :new WHERE exercise_slot_id IN (slots of the exercise)`.
  - `removeVariant` runs one batch: delete V's parked rows, then
    `swapVariantStatements(db, eq(plannedSets.variantId, V), fallbackVariantId(...), { parkCurrent: false })`,
    then set `removedAt = now` (retire) or delete the row (delete). It retires when any `set_logs`
    row of the profile has `variant_id = V`.
  - `swapVariantStatements` is the one place the swap happens. It returns these statements in this
    order:
    1. When `parkCurrent`, upsert into `planned_set_variant_weights` (`planned_set_id`, `variant_id`,
       `last_weight_grams`), selected from `planned_sets` in `scope` where `variant_id` and
       `last_weight_grams` are not null.
    2. `UPDATE planned_sets SET variant_id = :to, last_weight_grams = (SELECT w.last_weight_grams FROM planned_set_variant_weights w WHERE w.planned_set_id = planned_sets.id AND w.variant_id = :to) WHERE scope`.
       When `:to` is null, set the weight to null.
    3. When `:to` is not null,
       `DELETE FROM planned_set_variant_weights WHERE variant_id = :to AND planned_set_id IN (SELECT id FROM planned_sets WHERE variant_id = :to)`.
       Invariant 2 makes this correct without the original scope.
  - Add `variants` to `getExerciseUsage` via `listActiveVariants`.
- [ ] **Step 5: Run them and see them pass** — same command plus `src/features/fitness-tracker/server/exercises`. Expected: PASS.
- [ ] **Step 6: Gate and commit** — `check.ps1` exits 0, then commit with the message `Store exercise variants and their parked last weights`.

---

### Task 4: Switching in a session, and logging with the variant

**Files:**

- Modify: `src/features/fitness-tracker/server/variants.ts`, `src/features/fitness-tracker/server/variants.storage.test.ts`
- Modify: `src/features/fitness-tracker/server/training.ts` (`getSession`, `logSet`), `src/features/fitness-tracker/server/training.storage.test.ts`
- Modify: `src/features/fitness-tracker/domain/types.ts` (`SessionSlot`), `src/features/fitness-tracker/components/test-fixtures.ts`

**Interfaces:**

- Consumes: `decideVariantSwitch` (Task 2), and `swapVariantStatements` and `listActiveVariants` (Task 3).
- Produces:

  ```ts
  export async function switchSlotVariant(
    db: Database,
    profileId: string,
    sessionId: string,
    slotId: string,
    input: { variantId: string },
  ): Promise<Result<void, 'not-found' | 'session-not-in-progress' | 'variant-locked'>>;
  ```

  `SessionSlot` gains `variants: ExerciseVariant[]` and `selectedVariantId: string | null`. The
  selection is the `variant_id` of the slot's planned sets in the session's block.

- [ ] **Step 1: Write the failing storage tests.**
  - `the session lists the exercise's active variants and the slot's selected one`.
  - `switching loads the target's weights into every block of the slot and parks the current ones`.
    Use a periodized 2-block slot: block 1 and block 2 both move to B.
  - Review Focus 1: `switching A → B → A restores A's weights exactly and never parks a null`.
    Use a slot with set 1 at 40 kg and set 2 never logged. After B and back to A, the weights are
    `[40, null]` and the parked table has no row for set 2.
  - `refuses to switch once a set of the slot is logged in this session` → `fail('variant-locked')`
    with nothing changed. Logging in **another** slot of the session does not lock this one.
  - `switching to the selected variant succeeds without writing`.
  - Review Focus 4: another profile's session, a slot outside the session's workout, or a variant of
    a different exercise each → `fail('not-found')`. A finished session →
    `fail('session-not-in-progress')`.
  - In `training.storage.test.ts`: `logSet records the slot's selected variant on the set log`, and
    `logSet updates only the selected variant's weight`. B is selected with 30 kg and A is parked
    at 40 kg. Logging 32.5 gives B 32.5, and A stays parked at 40.
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project storage src/features/fitness-tracker/server/variants src/features/fitness-tracker/server/training`.
- [ ] **Step 3: Implement.**
  - `switchSlotVariant` loads the session by profile, the slot (it must belong to
    `session.workoutId`), the slot's current `variant_id`, the exercise's active variant ids, and
    the count of `set_logs` for this session and slot. It calls `decideVariantSwitch`, and on
    `switch` runs
    `runBatch(db, swapVariantStatements(db, eq(plannedSets.exerciseSlotId, slotId), variantId, { parkCurrent: true }))`.
  - `getSession` fills the two new fields.
  - `logSet` selects `plannedSets.variantId` with the target and writes it to the new row. Its
    weight update is unchanged.
  - Update `test-fixtures.ts` so its `SessionSlot` builder defaults to `variants: []` and
    `selectedVariantId: null`.
- [ ] **Step 4: Run them and see them pass** — same command. Expected: PASS.
- [ ] **Step 5: Gate and commit** — `check.ps1` exits 0, then commit with the message `Switch an exercise's variant mid-session and log sets against it`.

---

### Task 5: Program edits keep the variant and parked weights consistent

**Files:**

- Modify: `src/features/fitness-tracker/server/programs.ts`
- Modify: `src/features/fitness-tracker/server/periodization.storage.test.ts`, `src/features/fitness-tracker/server/programs.storage.test.ts`

**Interfaces:**

- Consumes: `PlannedSetDraft` / `draftsForNewBlock` (Task 2) and `listActiveVariants` (Task 3).
- Produces: no new exports. `insertPlannedSets` writes `variant_id` and each draft's
  `parkedWeights` rows. `plannedSetColumns` becomes `7`, and the parked rows are chunked with 3
  columns.

- [ ] **Step 1: Write the failing storage tests.**
  - `a new slot starts on the exercise's oldest active variant with no weights` (`addExerciseSlot`).
  - `replacing a slot's exercise selects the new exercise's oldest active variant, or none, and drops all parked weights`.
  - `adding sets to a prescription gives the new planned sets the slot's variant` (both
    `setPrescription` and `setUniformPrescription`).
  - `a new block copies the slot's variant`, and, for a **non-periodized** slot, `copies the last block's parked weights per set` (Review Focus 3).
  - `turning periodization on clears parked weights too`.
  - Review Focus 3: `turning periodization off carries each variant's most recent weight per set into every block`.
    A is selected with 40 kg in block 1. B is parked at 30 kg in block 1 and 35 kg in block 2, and
    the current block is 2. After the change, every block has A at 40 and B parked at 35.
  - `the weekly volume estimate is unchanged by variants`. The `Program` value from `getProgram`
    is equal before and after adding two variants, so the volume inputs did not change.
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project storage src/features/fitness-tracker/server/programs src/features/fitness-tracker/server/periodization`.
- [ ] **Step 3: Implement.**
  - Add a helper `slotVariantId(db, slotId): Promise<string | null>` that reads any one planned set
    of the slot. `prescriptionStatements` takes it as a new `variantId` parameter and puts it on
    inserted drafts.
  - `addExerciseSlot` and `replaceSlotExercise` take the oldest active variant from
    `listActiveVariants`. `replaceSlotExercise` deletes the slot's parked rows before its update.
  - `addTrainingBlock` reads the last block's parked rows with a separate query, keeping
    `ProgramRows` unchanged, and passes `variantId` and, for non-periodized slots,
    `parkedWeightsBySet`.
  - In `setSlotPeriodization`, turning it on also deletes the slot's parked rows. Turning it off
    groups the parked rows by variant and runs `carriedWeightsBySet` for each variant. At the end of
    the batch it deletes the slot's parked rows and inserts the carried ones for every planned set
    with that set number.
- [ ] **Step 4: Run them and see them pass** — same command. Expected: PASS.
- [ ] **Step 5: Gate and commit** — `check.ps1` exits 0, then commit with the message `Keep variant selection and parked weights through program edits`.

---

### Task 6: Route handlers and routes

**Files:**

- Create: `src/features/fitness-tracker/server/handlers/variants.ts`, `src/features/fitness-tracker/server/handlers/variants.storage.test.ts`
- Create: `src/app/api/fitness/exercises/[id]/variants/route.ts` (`POST`), `src/app/api/fitness/exercises/[id]/variants/[variantId]/route.ts` (`DELETE`), `src/app/api/fitness/sessions/[id]/slots/[slotId]/variant/route.ts` (`PUT`)

**Interfaces:**

- Consumes: `addVariant`, `removeVariant` and `switchSlotVariant`.
- Produces: `handleAddVariant`, `handleRemoveVariant` and `handleSwitchVariant`, each
  `(context: FitnessRequestContext) => Promise<Response>`.
  - `POST /api/fitness/exercises/:id/variants` takes `{ name: string }` and answers `ExerciseVariant`.
  - `DELETE /api/fitness/exercises/:id/variants/:variantId` answers `{ removal }`.
  - `PUT /api/fitness/sessions/:id/slots/:slotId/variant` takes `{ variantId: string }` and answers `{}`.
  - Each route file is a one-liner, as in `src/app/api/fitness/exercises/[id]/route.ts`.

- [ ] **Step 1: Write the failing handler tests**, using `handlerContext` and `jsonOf`:
  - add answers 200 with `{ name: 'Gym A' }`
  - a non-string name → 400 `invalid-body`
  - a taken name → 409 `name-taken`
  - remove answers `{ removal: 'delete' }`
  - switch answers 200
  - switch after a logged set → 409 `{ error: 'variant-locked' }`
  - a missing `variantId` → 400
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project storage src/features/fitness-tracker/server/handlers/variants`.
- [ ] **Step 3: Implement** the handlers in the style of `handlers/exercises.ts`, using
      `readJson`/`readString` and then `respond` or `respondEmpty`. Add the three route files.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Gate and commit** — `check.ps1` exits 0, then commit with the message `Expose variant routes`.

---

### Task 7: Managing variants on the exercise edit screen

**Files:**

- Modify: `src/features/fitness-tracker/components/AddNameForm.tsx` (+ create `AddNameForm.test.tsx`)
- Create: `src/features/fitness-tracker/components/VariantEditor.tsx`, `VariantEditor.module.css`, `VariantEditor.test.tsx`
- Modify: `src/app/fitness-tracker/exercises/[exerciseId]/ExerciseEditScreen.tsx`, `ExerciseEditScreen.test.tsx`

**Interfaces:**

- Consumes: `ExerciseUsage.variants` (Task 3), the routes (Task 6), and
  `fitnessStrings.exerciseEdit.variants` (Task 1).
- Produces:
  - `AddNameForm` gains an optional `confirm?: { message: string; confirmLabel: string }`.
  - `VariantEditor({ exerciseId, variants }: { exerciseId: string; variants: readonly ExerciseVariant[] })`.

- [ ] **Step 1: Write the failing `dom` tests.**
  - `AddNameForm`: with `confirm`, clicking the submit button shows `confirm.message` and posts
    nothing until `confirmLabel` is clicked. Review Focus 5: pressing Enter in the field also posts
    nothing until confirmed. Without `confirm`, it posts directly, as today.
  - `VariantEditor`: it lists each variant with a `remove(name)` button. With no variants it shows
    `empty` and its add form asks for `firstConfirm`. With one or more variants the add form has no
    confirmation.
  - `ExerciseEditScreen`: renders a region named `variants.heading`.
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project dom src/features/fitness-tracker/components src/app/fitness-tracker/exercises`.
- [ ] **Step 3: Implement.**
  - In `AddNameForm`, when `confirm` is set, swap the submit button for `ConfirmDialog` with
    `triggerLabel={submitLabel}` and `triggerClassName={styles.submit}`. The dialog's `onConfirm`
    posts. The form's `onSubmit` only `preventDefault`s while `confirm` is set, which stops the
    implicit submit from a single-field form.
  - `VariantEditor` renders a list in the style of `ExerciseEditScreen.module.css` `.list`. Each
    variant gets a `ConfirmActionButton` that DELETEs it. Below the list is an `AddNameForm`
    posting to `/api/fitness/exercises/${exerciseId}/variants`, with `confirm` only when
    `variants.length === 0`.
  - Add the section between "Muscles worked" and "Used in".
- [ ] **Step 4: Run them and see them pass.** Then check the screen at phone width with the
      Playwright MCP browser (run-app skill), in light and dark mode.
- [ ] **Step 5: Gate and commit** — `check.ps1` exits 0, then commit with the message `Manage an exercise's variants on its edit screen`.

---

### Task 8: The variant picker in the session

**Files:**

- Create: `src/features/fitness-tracker/components/VariantPicker.tsx`, `VariantPicker.module.css`, `VariantPicker.test.tsx`
- Modify: `src/features/fitness-tracker/components/SessionBody.tsx`, `src/features/fitness-tracker/components/useSetDrafts.ts`, `useSetDrafts.test.tsx`
- Modify: `src/app/fitness-tracker/active/sessions/[sessionId]/WorkoutSessionScreen.test.tsx`

**Interfaces:**

- Consumes: `SessionSlot.variants` and `selectedVariantId` (Task 4), the `PUT` route (Task 6), and
  `fitnessStrings.session.variantLabel` (Task 1).
- Produces:

  ```ts
  type VariantPickerProps = {
    sessionId: string;
    slotId: string;
    exerciseName: string;
    variants: readonly ExerciseVariant[];
    selectedVariantId: string | null;
    locked: boolean;
    onSwitched: () => void;
  };
  ```
  - `useSetDrafts` gains `clearWeightDrafts(plannedSetIds: readonly string[])`, which removes only
    `weight` and keeps `reps`.

- [ ] **Step 1: Write the failing `dom` tests.**
  - `VariantPicker`: it is a combobox labelled `variantLabel(exerciseName)` with one option per
    variant and `selectedVariantId` selected. Choosing another option PUTs `{ variantId }` to
    `/api/fitness/sessions/${sessionId}/slots/${slotId}/variant` and calls `onSwitched` on success.
    It is disabled when `locked`. On failure it shows the error and the original selection again.
  - `useSetDrafts`: `clearWeightDrafts` removes weights for the given ids and keeps their reps and
    the other ids' drafts.
  - `WorkoutSessionScreen`: a slot with variants shows the picker. A slot without variants does
    not. A slot with a logged set has the picker disabled.
- [ ] **Step 2: Run them and see them fail** — `npx vitest run --project dom src/features/fitness-tracker/components src/app/fitness-tracker/active`.
- [ ] **Step 3: Implement.**
  - `VariantPicker` is a native `<select>`, which reads well on iPhone. It keeps the chosen value in
    local state while the `useFitnessAction` request is pending, then reverts to the prop on
    failure. Success refreshes the route through the hook's default.
  - In `SlotSection`, render the picker under the header when `slot.variants.length > 0`, with
    `locked = slot.loggedSets.length > 0 || slot.plannedSets.some((set) => logging.optimistic[set.id] !== undefined)`
    and `onSwitched = () => clearWeightDrafts(slot.plannedSets.map((set) => set.id))`.
- [ ] **Step 4: Run them and see them pass.** Then check the session at phone width with the MCP
      browser.
- [ ] **Step 5: Gate and commit** — `check.ps1` exits 0, then commit with the message `Pick an exercise's variant during a workout`.

---

### Task 9: Acceptance, docs and finish

**Files:**

- Create: `docs/architecture/009-exercise-variants.md`
- Modify: `CLAUDE.md` (Project state paragraph on the fitness tracker: "thirteen-table" becomes
  "fifteen-table", one sentence on variants and parked weights, and a link to 009)

- [ ] **Step 1: Run the acceptance test** — `pwsh -NoProfile -File scripts/e2e.ps1 -Path e2e/exercise-variants.spec.ts`. Expected: exit 0. Then run the full `scripts/e2e.ps1`, expecting exit 0, which shows the other features did not regress.
- [ ] **Step 2: Write ADR 009** in the format of `008-weekly-volume-estimate.md` (Status, Date
      2026-10-20, Context, Decision, Consequences). Record that variants belong to the exercise (so the
      volume is unchanged), the selected-weight-in-place plus parked-table model and its two
      invariants, the retire/delete rule, why `set_logs.variant_id` has no foreign key, and the
      locking rule.
- [ ] **Step 3: Update `CLAUDE.md`** and run `check.ps1` (exit 0).
- [ ] **Step 4: Commit** with the message `Accept and document exercise variants`.
