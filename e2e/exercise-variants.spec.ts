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

test('an exercise keeps separate last weights per variant, switchable until a set is logged', async ({
  page,
  context,
}) => {
  const run = Date.now().toString(36);
  const programName = `Program ${run}`;
  const workoutName = `Day ${run}`;
  const exerciseName = `Row ${run}`;
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
  await signIn(context);

  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: fitnessStrings.home.programsLink }).click();
  await page.getByLabel(fitnessStrings.programs.nameLabel, { exact: true }).fill(programName);
  await page.getByLabel(fitnessStrings.programs.blocksLabel, { exact: true }).fill('2');
  await page.getByRole('button', { name: fitnessStrings.programs.create }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.programEdit.addWorkout }).click();
  await page.getByLabel(fitnessStrings.workoutEdit.nameLabel, { exact: true }).fill(workoutName);
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.create }).click();
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
  await weight.fill('40');
  await logButton.click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openExercise(page, exerciseName);
  const variantsRegion = page.getByRole('region', { name: variants.heading });
  await expect(variantsRegion).toBeVisible();
  await page.getByLabel(variants.nameLabel, { exact: true }).fill('Gym A');
  await page.getByRole('button', { name: variants.add, exact: true }).click();
  const firstDialog = page.getByRole('dialog');
  await expect(firstDialog).toContainText(variants.firstConfirm);
  await firstDialog.getByRole('button', { name: variants.firstConfirmLabel, exact: true }).click();
  await expect(variantsRegion).toContainText('Gym A');
  await page.getByLabel(variants.nameLabel, { exact: true }).fill('Gym B');
  await page.getByRole('button', { name: variants.add, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(variantsRegion).toContainText('Gym A');
  await expect(variantsRegion).toContainText('Gym B');

  await openBlockWorkout(page, programName, 2, workoutName);
  await expect(variantPicker.locator('option:checked')).toHaveText('Gym A');
  await expect(weight).toHaveAttribute('placeholder', '40');
  await variantPicker.selectOption({ label: 'Gym B' });
  await expect(weight).toHaveAttribute('placeholder', '');

  const sessionUrl = page.url();
  await page.goto('/fitness-tracker');
  await page.goto(sessionUrl);
  await expect(variantPicker.locator('option:checked')).toHaveText('Gym B');

  await weight.fill('30');
  await logButton.click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await expect(variantPicker).toBeDisabled();
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openExercise(page, exerciseName);
  await page.getByRole('button', { name: variants.remove('Gym B'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: variants.removeConfirmLabel, exact: true })
    .click();
  await expect(variantsRegion).not.toContainText('Gym B');
  await expect(variantsRegion).toContainText('Gym A');

  await openBlockWorkout(page, programName, 1, workoutName);
  await expect(variantPicker.locator('option:checked')).toHaveText('Gym A');
  await expect(weight).toHaveAttribute('placeholder', '40');
});
