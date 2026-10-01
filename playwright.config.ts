import { defineConfig, devices } from '@playwright/test';

process.loadEnvFile('.env.local');

const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'mobile-safari', use: { ...devices['iPhone 17'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { E2E_STUB_GOOGLE_SHEETS: '1' },
  },
});
