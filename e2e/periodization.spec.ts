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

test('a non-periodized exercise carries its weights from one block to the next', async ({
  page,
  context,
}) => {
  test.slow();
  const run = Date.now().toString(36);
  const programName = `Program ${run}`;
  const workoutName = `Day ${run}`;
  const exerciseName = `Curl ${run}`;
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
  await page.getByLabel(fitnessStrings.workoutEdit.setsLabel, { exact: true }).fill('2');
  await page.getByLabel(fitnessStrings.workoutEdit.repsLabel, { exact: true }).fill('10');
  await expect(
    page.getByRole('checkbox', { name: fitnessStrings.workoutEdit.periodizedLabel }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: fitnessStrings.workoutEdit.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: workoutName })).toBeVisible();
  const slotRow = page.getByRole('listitem').filter({ hasText: exerciseName });
  await expect(slotRow).toContainText('2×10');
  await expect(slotRow).not.toContainText('·');

  await page.getByRole('link', { name: fitnessStrings.navigation.toProgram }).click();
  await page.getByRole('button', { name: fitnessStrings.programEdit.activate }).click();
  await expect(page.getByText(fitnessStrings.programEdit.active, { exact: true })).toBeVisible();

  await openBlockWorkout(page, programName, 1, workoutName);
  await page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(1) }).fill('20');
  await page.getByRole('button', { name: fitnessStrings.session.logLabel(1) }).click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(1))).toBeVisible();
  await page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(2) }).fill('22,5');
  await page.getByRole('button', { name: fitnessStrings.session.logLabel(2) }).click();
  await expect(page.getByText(fitnessStrings.session.loggedLabel(2))).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.session.finishWorkout }).click();
  await expect(page).toHaveURL(/\/finished/);

  await openBlockWorkout(page, programName, 2, workoutName);
  await expect(
    page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(1) }),
  ).toHaveAttribute('placeholder', '20');
  await expect(
    page.getByRole('textbox', { name: fitnessStrings.session.weightLabel(2) }),
  ).toHaveAttribute('placeholder', '22.5');

  await page.goto('/fitness-tracker/programs');
  await page.getByRole('link', { name: new RegExp(programName) }).click();
  await page.getByRole('link', { name: new RegExp(workoutName) }).click();
  await page.getByRole('link', { name: new RegExp(exerciseName) }).click();
  await expect(
    page.getByRole('region', { name: fitnessStrings.slotEdit.everyBlockTitle }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: fitnessStrings.slotEdit.periodizedToggle }).check();
  await expect(page.getByText(fitnessStrings.slotEdit.periodizeConfirm)).toBeVisible();
  await page.getByRole('button', { name: fitnessStrings.slotEdit.periodizeApply }).click();
  await expect(
    page.getByRole('region', { name: fitnessStrings.slotEdit.blockTitle(2, null) }),
  ).toBeVisible();
});
