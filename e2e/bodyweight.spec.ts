import { expect, test } from '@playwright/test';
import { sealTestSession, sessionCookie } from './test-session';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([sessionCookie(await sealTestSession())]);
  await page.goto('/fitness-tracker');
  await page.waitForLoadState('networkidle');
});

test('recording a measurement shows it in the history, and it survives a reload', async ({
  page,
}) => {
  await page.getByLabel('Weight (kg)').fill('91.3');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('91.3 kg')).toBeVisible();

  await page.reload();

  await expect(page.getByText('91.3 kg')).toBeVisible();
});

test('a weight of 5 is rejected with a visible message and adds no history entry', async ({
  page,
}) => {
  await page.getByLabel('Weight (kg)').fill('5');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Weight must be between 20 and 400 kg.')).toBeVisible();
  await expect(page.getByText('5 kg')).toHaveCount(0);
});
