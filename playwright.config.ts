import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.AEGIS_APP_URL;
const useManagedServers = !externalBaseURL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:8201',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: useManagedServers
    ? {
        command: 'npm run build && node tests/e2e/start-servers.mjs',
        url: 'http://127.0.0.1:8202/ready',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  projects: externalBaseURL ? [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ] : [
    {
      name: 'fresh-chromium',
      testMatch: /setup\.spec\.ts|claim-flow\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8200' },
    },
    {
      name: 'owner-chromium',
      testMatch: /core-flow\.spec\.ts|settings\.spec\.ts|claim-flow\.spec\.ts|responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8201' },
    },
  ],
});
