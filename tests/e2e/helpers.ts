import type { Page } from '@playwright/test';

export const BASE = process.env.AEGIS_APP_URL ?? 'http://localhost:8000';

export async function completeSetup(page: Page, opts: {
  displayName?: string;
  email?: string;
  password?: string;
} = {}) {
  const {
    displayName = 'E2E Owner',
    email = 'e2e@test.local',
    password = 'e2e-testpass-1234',
  } = opts;

  await page.goto('/');
  // Should redirect to setup on fresh install
  await page.waitForURL('**/');

  // Step through the setup wizard
  // Step 1: Welcome — click Next
  const nextBtn = page.getByRole('button', { name: /next|continue|get started/i });
  if (await nextBtn.isVisible()) await nextBtn.click();

  // Step 2: Profile
  const nameInput = page.getByPlaceholder(/name/i).or(page.locator('input[placeholder*="Name"]'));
  if (await nameInput.isVisible()) {
    await nameInput.fill(displayName);
    await page.getByPlaceholder(/email/i).fill(email);
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Step 3: Security (password)
  const pwInput = page.getByPlaceholder(/passphrase|password/i).first();
  if (await pwInput.isVisible()) {
    await pwInput.fill(password);
    await page.getByPlaceholder(/confirm/i).fill(password);
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Step 4+: Deployment, Acknowledgement, Review
  // Click through remaining steps
  for (let i = 0; i < 5; i++) {
    const btn = page.getByRole('button', { name: /next|continue|submit|finish|complete/i });
    if (await btn.isVisible()) {
      // Check all required checkboxes first
      const checkboxes = page.locator('input[type="checkbox"]:not(:checked)');
      const count = await checkboxes.count();
      for (let j = 0; j < count; j++) {
        await checkboxes.nth(j).check();
      }
      await btn.click();
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }
}

export async function login(page: Page, password = 'e2e-testpass-1234') {
  await page.goto('/');
  await page.getByPlaceholder(/passphrase|password/i).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('**/dashboard');
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /log out/i }).click();
}

export async function getCsrfToken(page: Page): Promise<string> {
  const response = await page.request.get('/api/csrf');
  const data = await response.json();
  return data.csrfToken;
}
