import { expect, test } from '@playwright/test';
import { ALLOWED_GOOGLE_EMAIL, sealTestSession, sessionCookie } from './test-session';

test('a signed-out visitor requesting / lands on /sign-in', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
});

test('a request carrying a valid session cookie reaches /', async ({ page, context }) => {
  await context.addCookies([sessionCookie(await sealTestSession(ALLOWED_GOOGLE_EMAIL))]);

  await page.goto('/');

  await expect(page).toHaveURL('http://localhost:3000/');
});

test('signing out returns to the signed-out state', async ({ page, context }) => {
  await context.addCookies([sessionCookie(await sealTestSession(ALLOWED_GOOGLE_EMAIL))]);
  await page.goto('/');
  await expect(page).toHaveURL('http://localhost:3000/');

  await page.request.post('/api/auth/sign-out');
  await page.goto('/');

  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
});
