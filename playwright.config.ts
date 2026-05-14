import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.AEGIS_APP_URL ?? 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // E2E tests require a running Aegis server.
  // Start manually: AEGIS_DB_PATH=./data/e2e-aegis.db NODE_ENV=test node server/dist/index.js
  // Or use: npm run build && AEGIS_DB_PATH=./data/e2e.db node server/dist/index.js
});
