import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Responsive app shell', () => {
  test.beforeEach(async ({ page }) => {
    const statusRes = await page.request.get('/api/setup/status');
    const status = await statusRes.json();
    if (!status.ownerExists) {
      test.skip();
    }
  });

  test('dashboard content uses the mobile viewport instead of being squeezed beside the sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    const main = page.locator('.app-shell__main');
    await expect(main).toBeVisible();
    const mainBox = await main.boundingBox();
    expect(mainBox?.width).toBeGreaterThanOrEqual(360);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^dashboard$/i })).toBeVisible();
  });
});
