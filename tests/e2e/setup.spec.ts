import { test, expect } from '@playwright/test';

test.describe('Setup wizard', () => {
  test('fresh install shows setup wizard', async ({ page }) => {
    await page.goto('/');
    // On a fresh install, setup wizard or setup route should be visible
    // The app may show setup inline or redirect — check for setup-specific content
    await expect(page.getByText(/welcome|set up|create.*account|aegis/i).first()).toBeVisible();
  });

  test('setup page does not expose auth routes prematurely', async ({ page }) => {
    const res = await page.request.get('/api/auth/me');
    // Before setup, should return 428 (setup required) or 401
    expect([401, 428]).toContain(res.status());
  });

  test('setup status endpoint reports setup not complete', async ({ page }) => {
    const res = await page.request.get('/api/setup/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ownerExists).toBe(false);
  });
});
