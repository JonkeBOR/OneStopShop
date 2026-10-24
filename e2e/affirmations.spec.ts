import { expect, test, type Page } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { clearAffirmations, seedAffirmations, seededSet } from './affirmations';
import { signIn } from './session';

test.describe.configure({ mode: 'serial' });

async function startOnlyWorkout(page: Page, run: string): Promise<void> {
  const programName = `Affirmations ${run}`;
  const workoutName = `Day ${run}`;

  await page.goto('/fitness-tracker/programs');
  await page.getByRole('link', { name: fitnessStrings.programs.add }).click();
  await page.getByLabel(fitnessStrings.programEdit.nameLabel, { exact: true }).fill(programName);
  await page.getByRole('button', { name: fitnessStrings.common.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.programEdit.addWorkout }).click();
  await page.getByLabel(fitnessStrings.workoutEdit.nameLabel, { exact: true }).fill(workoutName);
  await page.getByRole('button', { name: fitnessStrings.common.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.workoutEdit.addExercise }).click();
  await page
    .getByLabel(fitnessStrings.workoutEdit.exerciseLabel, { exact: true })
    .selectOption({ label: fitnessStrings.workoutEdit.newExerciseOption });
  await page.getByLabel(fitnessStrings.workoutEdit.newExerciseNameLabel).fill(`Press ${run}`);
  await page.getByLabel(fitnessStrings.workoutEdit.setsLabel, { exact: true }).fill('1');
  await page.getByLabel(fitnessStrings.workoutEdit.repsLabel, { exact: true }).fill('5');
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.navigation.toProgram }).click();
  await page.getByRole('button', { name: fitnessStrings.programEdit.activate }).click();
  await expect(page.getByText(fitnessStrings.programEdit.active, { exact: true })).toBeVisible();

  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: new RegExp(programName) }).click();
  await page.getByRole('link', { name: new RegExp(fitnessStrings.block.name(1)) }).click();
  await page.getByRole('button', { name: new RegExp(workoutName) }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(workoutName) }),
  ).toBeVisible();
}

async function logTheSet(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(1) }).fill('40');
  await page.getByRole('button', { name: fitnessStrings.session.logLabel(1) }).click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
}

async function finishedAffirmation(page: Page): Promise<string | null> {
  await expect(page).toHaveURL(/\/finished/);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).not.toBeEmpty();
  return heading.textContent();
}

test('a fully completed session shows a fully-completed affirmation, also after a reload', async ({
  page,
  context,
}) => {
  test.slow();
  seedAffirmations(seededSet);
  await signIn(context);
  await startOnlyWorkout(page, Date.now().toString(36));

  await logTheSet(page);
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();

  const shown = await finishedAffirmation(page);
  expect(seededSet['fully-completed']).toContain(shown);
  await page.reload();
  expect(await finishedAffirmation(page)).toBe(shown);
});

test('a session finished with no sets logged shows a skipped-whole-workout affirmation', async ({
  page,
  context,
}) => {
  test.slow();
  seedAffirmations(seededSet);
  await signIn(context);
  await startOnlyWorkout(page, Date.now().toString(36));

  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await page.getByRole('button', { name: fitnessStrings.session.finishEmptyConfirmLabel }).click();

  expect(seededSet['skipped-whole-workout']).toContain(await finishedAffirmation(page));
});

test('with no affirmations stored the finished screen shows a fixed line', async ({
  page,
  context,
}) => {
  test.slow();
  clearAffirmations();
  await signIn(context);
  await startOnlyWorkout(page, Date.now().toString(36));

  await logTheSet(page);
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();

  expect(fitnessStrings.finished.affirmations).toContain(await finishedAffirmation(page));
});
