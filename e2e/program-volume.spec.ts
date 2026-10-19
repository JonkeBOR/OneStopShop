import { expect, type Page, test } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { signIn } from './session';

function savedLink(page: Page, bodyPart: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes(`/body-parts/${bodyPart}`) &&
      response.ok(),
  );
}

async function tap(page: Page, name: string, bodyPart: string) {
  const saved = savedLink(page, bodyPart);
  await page.getByRole('checkbox', { name, exact: true }).locator('path').first().click();
  await saved;
}

test('estimates the weekly sets each body part gets from the program', async ({
  page,
  context,
}) => {
  const run = Date.now().toString(36);
  const programName = `Program ${run}`;
  const workoutName = `Day ${run}`;
  const exerciseName = `Press ${run}`;
  await signIn(context);

  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: fitnessStrings.home.programsLink }).click();
  await page.getByLabel(fitnessStrings.programs.nameLabel, { exact: true }).fill(programName);
  await page.getByLabel(fitnessStrings.programs.blocksLabel, { exact: true }).fill('1');
  await page.getByRole('button', { name: fitnessStrings.programs.create }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();
  const programUrl = page.url();

  await page.getByRole('link', { name: fitnessStrings.programEdit.addWorkout }).click();
  await page.getByLabel(fitnessStrings.workoutEdit.nameLabel, { exact: true }).fill(workoutName);
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.create }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.workoutEdit.addExercise }).click();
  await page
    .getByLabel(fitnessStrings.workoutEdit.exerciseLabel, { exact: true })
    .selectOption({ label: fitnessStrings.workoutEdit.newExerciseOption });
  await page.getByLabel(fitnessStrings.workoutEdit.newExerciseNameLabel).fill(exerciseName);
  await page.getByLabel(fitnessStrings.workoutEdit.setsLabel, { exact: true }).fill('4');
  await page.getByLabel(fitnessStrings.workoutEdit.repsLabel, { exact: true }).fill('10');
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.goto('/fitness-tracker/exercises', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: exerciseName }).click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();
  await tap(page, 'Chest', 'chest');
  await tap(page, 'Triceps', 'triceps');
  await tap(page, 'Triceps', 'triceps');

  await page.goto(programUrl);
  const volume = page.getByRole('region', { name: fitnessStrings.programVolume.heading });
  await expect(volume.getByRole('img')).toBeVisible();
  await expect(volume.locator('[data-muscle="chest"]').first()).toHaveAttribute(
    'data-highlight',
    'low',
  );
  await expect(volume.locator('[data-muscle="triceps"]').first()).toHaveAttribute(
    'data-highlight',
    'low',
  );
  await expect(volume.locator('[data-muscle="lats"]').first()).not.toHaveAttribute(
    'data-highlight',
  );
  await expect(volume.getByRole('combobox')).toHaveCount(0);
});
