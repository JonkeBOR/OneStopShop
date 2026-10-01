import { expect, test } from '@playwright/test';
import { sealTestSession, sessionCookie } from './test-session';

test.beforeEach(async ({ context }) => {
  await context.addCookies([sessionCookie(await sealTestSession())]);
});

test('the session cookie is HttpOnly and invisible to document.cookie', async ({
  page,
  context,
}) => {
  await page.goto('/');

  const cookies = await context.cookies();
  const sessionCookieEntry = cookies.find((cookie) => cookie.name === 'session');
  expect(sessionCookieEntry?.httpOnly).toBe(true);

  const documentCookie = await page.evaluate(() => document.cookie);
  expect(documentCookie).not.toContain('session=');
});

test('localStorage and sessionStorage hold no Google credential', async ({ page }) => {
  await page.goto('/fitness-tracker');
  await page.waitForLoadState('networkidle');

  const storageSnapshot = await page.evaluate(() => ({
    localStorage: JSON.stringify(window.localStorage),
    sessionStorage: JSON.stringify(window.sessionStorage),
  }));

  expect(storageSnapshot.localStorage).toBe('{}');
  expect(storageSnapshot.sessionStorage).toBe('{}');
});

test('the browser never talks to Google directly, and no response leaks a token or key', async ({
  page,
}) => {
  const requestsToGoogle: string[] = [];
  const leakedBodies: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('google')) {
      requestsToGoogle.push(request.url());
    }
  });
  page.on('response', (response) => {
    void response
      .text()
      .then((text) => {
        if (
          text.includes('ya29.') ||
          text.includes('BEGIN PRIVATE KEY') ||
          text.includes('local-dev-sheet-id')
        ) {
          leakedBodies.push(response.url());
        }
      })
      .catch(() => undefined);
  });

  await page.goto('/fitness-tracker');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Weight (kg)').fill('83');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForLoadState('networkidle');

  expect(requestsToGoogle).toEqual([]);
  expect(leakedBodies).toEqual([]);
});
