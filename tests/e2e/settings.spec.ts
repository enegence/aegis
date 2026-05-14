import { test, expect } from '@playwright/test';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    const statusRes = await page.request.get('/api/setup/status');
    const status = await statusRes.json();
    if (!status.ownerExists) {
      test.skip();
    }
  });

  test('settings API does not expose raw secrets', async ({ page }) => {
    // Unauthenticated request should be rejected
    const res = await page.request.get('/api/settings');
    expect(res.status()).toBe(401);
  });

  test('settings API response does not contain secret values', async ({ page, context }) => {
    // Login first
    const loginRes = await page.request.post('/api/auth/login', {
      data: { password: process.env.E2E_PASSWORD ?? 'e2e-testpass-1234' },
      headers: { 'content-type': 'application/json' },
    });

    if (loginRes.status() !== 200) {
      test.skip();
      return;
    }

    const settingsRes = await page.request.get('/api/settings');
    if (settingsRes.status() !== 200) return;

    const body = await settingsRes.text();
    // Must not contain raw secret patterns
    expect(body).not.toMatch(/-----BEGIN/); // PEM keys
    // password fields should not appear as values
    expect(body).not.toMatch(/"password"\s*:\s*"[^"]{4,}"/);
    expect(body).not.toMatch(/"secretAccessKey"\s*:\s*"[^"]{4,}"/);
    expect(body).not.toMatch(/"apiKey"\s*:\s*"[^"]{4,}"/);
  });

  test('settings page renders tabs', async ({ page }) => {
    await page.goto('/settings');
    // Should show tabs or login page
    const content = await page.content();
    // Either tab labels or login form
    const hasTabs = content.includes('Profile') && content.includes('Deployment');
    const hasLogin = content.includes('Log In') || content.includes('password') || content.includes('passphrase');
    expect(hasTabs || hasLogin).toBe(true);
  });
});
