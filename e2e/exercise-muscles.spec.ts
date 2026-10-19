import { expect, type Page, test } from '@playwright/test';
import { fitnessStrings } from '@/lib/strings/fitness';
import { signIn } from './session';

function savedLink(page: Page, method: 'PUT' | 'DELETE') {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes('/body-parts/chest') &&
      response.ok(),
  );
}

test('marks the muscles an exercise trains as primary or secondary, and they are kept', async ({
  page,
  context,
}) => {
  const exerciseName = `Bench ${Date.now().toString(36)}`;
  await signIn(context);

  await page.goto('/fitness-tracker/exercises', { waitUntil: 'networkidle' });
  await page.getByLabel(fitnessStrings.exercises.nameLabel, { exact: true }).fill(exerciseName);
  await page.getByRole('button', { name: fitnessStrings.exercises.add }).click();
  await page.getByRole('link', { name: exerciseName }).click();
  await expect(page.getByRole('heading', { level: 1, name: exerciseName })).toBeVisible();

  const chest = page.getByRole('checkbox', { name: 'Chest', exact: true });
  await expect(chest).toHaveAttribute('aria-checked', 'false');
  await expect(chest).toHaveAccessibleDescription('');

  const primary = savedLink(page, 'PUT');
  await chest.locator('path').first().click();
  await expect(chest).toHaveAttribute('aria-checked', 'true');
  await expect(chest).toHaveAccessibleDescription(fitnessStrings.anatomy.roles.primary);
  await primary;

  await page.reload();
  await expect(chest).toHaveAccessibleDescription(fitnessStrings.anatomy.roles.primary);
  await expect(page.getByRole('checkbox', { name: 'Triceps', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  const secondary = savedLink(page, 'PUT');
  await chest.locator('path').first().click();
  await expect(chest).toHaveAttribute('aria-checked', 'true');
  await expect(chest).toHaveAccessibleDescription(fitnessStrings.anatomy.roles.secondary);
  await secondary;

  await page.reload();
  await expect(chest).toHaveAccessibleDescription(fitnessStrings.anatomy.roles.secondary);

  const unlinked = savedLink(page, 'DELETE');
  await chest.locator('path').first().click();
  await expect(chest).toHaveAttribute('aria-checked', 'false');
  await expect(chest).toHaveAccessibleDescription('');
  await unlinked;

  await page.reload();
  await expect(chest).toHaveAttribute('aria-checked', 'false');
});
