import { expect, test } from '@playwright/test';
import { sealTestSession, sessionCookie } from './test-session';

test.beforeEach(async ({ context }) => {
  await context.addCookies([sessionCookie(await sealTestSession())]);
});

test('/ lists exactly one feature card', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Fitness Tracker' })).toBeVisible();
  await expect(page.getByRole('link')).toHaveCount(1);
});

test('selecting the feature card navigates to /fitness-tracker, and back-to-home needs no re-authentication', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Fitness Tracker' }).click();
  await expect(page).toHaveURL('http://localhost:3000/fitness-tracker');

  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('http://localhost:3000/');
});

test('an unknown path renders the app’s own not-found page', async ({ page }) => {
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
