import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const serverOnlyStub = fileURLToPath(
  new URL('./node_modules/server-only/empty.js', import.meta.url),
);

const miniflareStorageSettings = {
  globalSetup: ['./vitest.storage-setup.ts'],
  fileParallelism: false,
  isolate: false,
  maxWorkers: 1,
  sequence: { groupOrder: 1 },
};

const storageOnMiniflare = process.env.STORAGE_TEST_BACKEND === 'd1';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': serverOnlyStub,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/lib/**/*.test.ts',
            'src/app/api/**/*.test.ts',
            'src/features/**/*.test.ts',
          ],
          exclude: ['**/*.storage.test.ts', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'storage',
          environment: 'node',
          include: ['src/**/*.storage.test.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
          ...(storageOnMiniflare ? miniflareStorageSettings : {}),
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
