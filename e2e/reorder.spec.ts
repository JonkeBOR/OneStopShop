import { expect, type Locator, type Page, test } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { signIn } from './session';

function savedMove(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && response.ok(),
  );
}

function workoutNames(page: Page): Locator {
  return page
    .getByRole('list', { name: fitnessStrings.programEdit.workoutsTitle })
    .getByRole('listitem')
    .getByRole('link');
}

test('reorders workouts by long-press drag and by keyboard, and the order is kept', async ({
  page,
  context,
}) => {
  const run = Date.now().toString(36);
  const names = [`A ${run}`, `B ${run}`, `C ${run}`] as const;
  await signIn(context);

  await page.goto('/fitness-tracker/programs', { waitUntil: 'networkidle' });
  await page.getByLabel(fitnessStrings.programs.nameLabel, { exact: true }).fill(`Order ${run}`);
  await page.getByLabel(fitnessStrings.programs.blocksLabel, { exact: true }).fill('1');
  await page.getByRole('button', { name: fitnessStrings.programs.create }).click();
  for (const name of names) {
    await page.getByRole('link', { name: fitnessStrings.programEdit.addWorkout }).click();
    await page.getByLabel(fitnessStrings.workoutEdit.nameLabel, { exact: true }).fill(name);
    await page.getByRole('button', { name: fitnessStrings.workoutEdit.create }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.getByRole('link', { name: fitnessStrings.navigation.toProgram }).click();
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await expect(workoutNames(page)).toHaveText(names);

  const first = page.getByRole('link', { name: names[0] });
  const last = page.getByRole('link', { name: names[2] });
  await last.scrollIntoViewIfNeeded();
  const from = await first.boundingBox();
  const to = await last.boundingBox();
  if (!from || !to) {
    throw new Error('The workout rows have no layout');
  }
  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2 + 10;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.waitForTimeout(400);
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(x, startY + ((endY - startY) * step) / 10);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  const dragSaved = savedMove(page);
  await page.mouse.up();
  await dragSaved;

  await expect(workoutNames(page)).toHaveText([names[1], names[2], names[0]]);
  await expect(page).toHaveURL(/\/fitness-tracker\/programs\/[^/]+$/);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(workoutNames(page)).toHaveText([names[1], names[2], names[0]]);

  const handle = page.getByRole('button', {
    name: fitnessStrings.reorder.handleFor(names[0]),
  });
  await handle.focus();
  for (const key of ['Space', 'ArrowUp', 'ArrowUp']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  const keyboardSaved = savedMove(page);
  await page.keyboard.press('Space');
  await keyboardSaved;

  await expect(workoutNames(page)).toHaveText(names);
  await page.reload();
  await expect(workoutNames(page)).toHaveText(names);
});
