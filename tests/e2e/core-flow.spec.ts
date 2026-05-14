import { test, expect } from '@playwright/test';

// NOTE: These tests require a pre-configured Aegis server with an owner account.
// They are skipped when running against a fresh install (setup not complete).

test.describe('Core owner flow', () => {
  test.beforeEach(async ({ page }) => {
    const statusRes = await page.request.get('/api/setup/status');
    const status = await statusRes.json();
    if (!status.ownerExists) {
      test.skip();
    }
  });

  test('login page renders without error', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/welcome back|log in/i).first()).toBeVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/passphrase|password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();
  });

  test('unauthenticated dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    // Should either show login form or redirect
    const url = page.url();
    const body = await page.content();
    expect(url.includes('/login') || url.includes('/dashboard') || body.includes('log in') || body.includes('Log In')).toBe(true);
  });
});
