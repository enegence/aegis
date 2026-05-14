import { test, expect } from '@playwright/test';

test.describe('Claim portal', () => {
  test('invalid claim token shows generic failure', async ({ page }) => {
    await page.goto('/claim/invalid-token-12345');
    // Should show some error state, not crash
    const statusRes = await page.request.get('/api/claim/invalid-token-12345');
    expect([400, 404, 410]).toContain(statusRes.status());
  });

  test('claim portal page renders without crash', async ({ page }) => {
    await page.goto('/claim/sometoken');
    // Page should load (even if it shows an error state for invalid token)
    const title = await page.title();
    expect(title).toBeTruthy();
    // Should not show 500 error
    await expect(page.getByText(/500|internal server error/i)).not.toBeVisible();
  });
});
