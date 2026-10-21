import { expect, type Page, test } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { signIn } from './session';

async function openExercise(page: Page, exerciseName: string) {
  await page.goto('/fitness-tracker/exercises');
  await page.getByRole('link', { name: exerciseName }).click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();
}

test('the home screen charts bodyweight and the exercise page charts estimated 1RM by program', async ({
  page,
  context,
}) => {
  test.slow();
  const run = Date.now().toString(36);
  const programName = `Program ${run}`;
  const workoutName = `Day ${run}`;
  const exerciseName = `Bench ${run}`;
  const progress = fitnessStrings.progress;
  const bodyweightChart = page.getByRole('figure', { name: progress.bodyweight.chartLabel });
  const oneRepMaxChart = page.getByRole('figure', { name: progress.oneRepMax.chartLabel });
  const legend = page.getByRole('list', { name: progress.legendLabel });
  await signIn(context);

  await page.goto('/fitness-tracker');
  await expect(bodyweightChart).not.toBeVisible();
  await expect(page.getByText(progress.bodyweight.empty)).toBeVisible();

  await page.getByRole('button', { name: fitnessStrings.home.weighIn }).click();
  await page.getByRole('textbox', { name: fitnessStrings.home.weighInInputLabel }).fill('80');
  await page.getByRole('button', { name: fitnessStrings.common.save }).click();
  await expect(bodyweightChart).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.home.programsLink }).click();
  await page.getByRole('link', { name: fitnessStrings.programs.add }).click();
  await page.getByLabel(fitnessStrings.programEdit.nameLabel, { exact: true }).fill(programName);
  await page.getByRole('button', { name: fitnessStrings.common.submit }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName })).toBeVisible();
  const programUrl = page.url();

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
  await page.getByLabel(fitnessStrings.workoutEdit.repsLabel, { exact: true }).fill('12');
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();

  await page.getByRole('link', { name: fitnessStrings.navigation.toProgram }).click();
  await page.getByRole('button', { name: fitnessStrings.programEdit.activate }).click();
  await expect(page.getByText(fitnessStrings.programEdit.active, { exact: true })).toBeVisible();

  await page.goto('/fitness-tracker');
  await page.getByRole('link', { name: new RegExp(programName) }).click();
  await expect(page).toHaveURL('/fitness-tracker/active');
  await page.getByRole('link', { name: new RegExp(fitnessStrings.block.name(1)) }).click();
  await page.getByRole('button', { name: new RegExp(workoutName) }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(workoutName) }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(1) }).fill('60');
  await page.getByRole('button', { name: fitnessStrings.session.logLabel(1) }).click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openExercise(page, exerciseName);
  await expect(oneRepMaxChart).toBeVisible();
  await expect(legend).toContainText(programName);

  await page.goto(programUrl);
  await page.getByRole('button', { name: fitnessStrings.programEdit.pause }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: fitnessStrings.activeProgram.pauseConfirmLabel })
    .click();
  await page.getByRole('button', { name: fitnessStrings.programEdit.deleteProgram }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: fitnessStrings.common.delete, exact: true })
    .click();
  await expect(page).toHaveURL('/fitness-tracker/programs');

  await openExercise(page, exerciseName);
  await expect(legend).toContainText(progress.deletedProgram(programName));

  await page
    .getByRole('combobox', { name: progress.rangeLabel })
    .selectOption({ label: progress.ranges.all });
  await expect(page).toHaveURL(/range=all/);
  await expect(oneRepMaxChart).toBeVisible();
});
