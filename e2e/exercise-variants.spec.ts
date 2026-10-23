import { expect, type Page, test } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { signIn } from './session';

async function openBlockWorkout(
  page: Page,
  programName: string,
  blockNumber: number,
  workoutName: string,
) {
  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: new RegExp(programName) }).click();
  await expect(page).toHaveURL('/fitness-tracker/active');
  await page
    .getByRole('link', { name: new RegExp(fitnessStrings.block.name(blockNumber)) })
    .click();
  await page.getByRole('button', { name: new RegExp(workoutName) }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(workoutName) }),
  ).toBeVisible();
}

async function openExercise(page: Page, exerciseName: string) {
  await page.goto('/fitness-tracker/exercises');
  await page.getByRole('link', { name: exerciseName }).click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();
}

test('every exercise starts with a default variant that can be renamed, kept, switched and retired', async ({
  page,
  context,
}) => {
  test.slow();
  const run = Date.now().toString(36);
  const programName = `Program ${run}`;
  const workoutName = `Day ${run}`;
  const exerciseName = `Seated cable row with neutral grip ${run}`;
  const variants = fitnessStrings.exerciseEdit.variants;
  const weight = page.getByRole('textbox', {
    name: fitnessStrings.session.weightLabel(1, exerciseName),
  });
  const logButton = page.getByRole('button', {
    name: fitnessStrings.session.logLabel(1, exerciseName),
  });
  const variantPicker = page.getByRole('combobox', {
    name: fitnessStrings.session.variantLabel(exerciseName),
  });
  const slotOptions = page.getByRole('link', {
    name: fitnessStrings.session.slotOptionsLabel(exerciseName),
  });
  const card = page.getByRole('region', { name: exerciseName });
  await signIn(context);

  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: fitnessStrings.home.programsLink }).click();
  await page.getByRole('link', { name: fitnessStrings.programs.add }).click();
  await page.getByLabel(fitnessStrings.programEdit.nameLabel, { exact: true }).fill(programName);
  await page.getByRole('button', { name: fitnessStrings.common.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.programEdit.addBlock }).click();
  await expect(
    page.getByRole('list', { name: fitnessStrings.programEdit.blocksTitle }).getByRole('listitem'),
  ).toHaveCount(2);

  await page.getByRole('link', { name: fitnessStrings.programEdit.addWorkout }).click();
  await page.getByLabel(fitnessStrings.workoutEdit.nameLabel, { exact: true }).fill(workoutName);
  await page.getByRole('button', { name: fitnessStrings.common.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.workoutEdit.addExercise }).click();
  await page
    .getByLabel(fitnessStrings.workoutEdit.exerciseLabel, { exact: true })
    .selectOption({ label: fitnessStrings.workoutEdit.newExerciseOption });
  await page.getByLabel(fitnessStrings.workoutEdit.newExerciseNameLabel).fill(exerciseName);
  await page.getByLabel(fitnessStrings.workoutEdit.setsLabel, { exact: true }).fill('1');
  await page.getByLabel(fitnessStrings.workoutEdit.repsLabel, { exact: true }).fill('10');
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.navigation.toProgram }).click();
  await page.getByRole('button', { name: fitnessStrings.programEdit.activate }).click();
  await expect(page.getByText(fitnessStrings.programEdit.active, { exact: true })).toBeVisible();

  await openBlockWorkout(page, programName, 1, workoutName);
  await expect(card.getByText('Default', { exact: true })).toHaveCount(0);
  await expect(slotOptions).toHaveCount(0);
  await weight.fill('40');
  await logButton.click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openExercise(page, exerciseName);
  const variantsRegion = page.getByRole('region', { name: variants.heading });
  await expect(variantsRegion).toBeVisible();
  await expect(variantsRegion).toContainText('Default');
  await expect(
    page.getByRole('button', { name: variants.remove('Default'), exact: true }),
  ).toHaveCount(0);
  await page.getByRole('textbox', { name: variants.renameLabel('Default') }).fill('Gym A');
  await variantsRegion
    .getByRole('listitem')
    .filter({ has: page.getByRole('textbox', { name: variants.renameLabel('Default') }) })
    .getByRole('button', { name: fitnessStrings.common.rename, exact: true })
    .click();
  await expect(variantsRegion).toContainText('Gym A');
  await page.getByLabel(variants.nameLabel, { exact: true }).fill('Gym B');
  await page.getByRole('button', { name: variants.add, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(variantsRegion).toContainText('Gym A');
  await expect(variantsRegion).toContainText('Gym B');
  await expect(
    page.getByRole('button', { name: variants.remove('Gym A'), exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: variants.remove('Gym B'), exact: true }),
  ).toBeVisible();

  await openBlockWorkout(page, programName, 2, workoutName);
  const sessionUrl = page.url();
  await expect(card.getByText('Gym A', { exact: true })).toBeVisible();
  await expect(slotOptions).toBeInViewport();
  await expect(weight).toHaveAttribute('placeholder', '40');
  await expect(variantPicker).toHaveCount(0);
  await slotOptions.click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(variantPicker.locator('option:checked')).toHaveText('Gym A');
  await variantPicker.selectOption({ label: 'Gym B' });
  await expect(page).toHaveURL(sessionUrl);
  await expect(card.getByText('Gym B', { exact: true })).toBeVisible();
  await expect(weight).toHaveAttribute('placeholder', '');

  await page.goto('/fitness-tracker');
  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  await expect(card.getByText('Gym B', { exact: true })).toBeVisible();

  await weight.fill('30');
  await logButton.click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await slotOptions.click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(variantPicker).toBeDisabled();
  await page.goto(sessionUrl, { waitUntil: 'networkidle' });
  const loggedRow = card
    .getByRole('row')
    .filter({ hasText: fitnessStrings.session.loggedLabel(1) });
  await expect(loggedRow.getByRole('cell').nth(1)).toHaveText('30');
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openExercise(page, exerciseName);
  const progressVariant = page.getByRole('combobox', {
    name: fitnessStrings.progress.variantLabel,
  });
  await expect(progressVariant).toBeVisible();
  await page.getByRole('button', { name: variants.remove('Gym B'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: variants.removeConfirmLabel, exact: true })
    .click();
  await expect(variantsRegion).not.toContainText('Gym B');
  await expect(
    page.getByRole('button', { name: variants.remove('Gym A'), exact: true }),
  ).toHaveCount(0);
  await expect(
    progressVariant.locator('option', {
      hasText: fitnessStrings.progress.retiredVariant('Gym B'),
    }),
  ).toHaveCount(1);
  await expect(progressVariant.locator('option', { hasText: 'Gym A' })).toHaveCount(1);

  await openBlockWorkout(page, programName, 1, workoutName);
  await expect(card.getByText('Gym A', { exact: true })).toHaveCount(0);
  await expect(slotOptions).toHaveCount(0);
  await expect(weight).toHaveAttribute('placeholder', '40');
});
