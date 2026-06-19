import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // In CI we'll run the frontend dev server; tests assume app is running at baseURL
  await page.goto('/');
});

test('homepage loads and /api/health returns ok', async ({ page, request }) => {
  // Basic smoke: check that the app root element renders
  await expect(page.locator('#root, #app')).toHaveCount(1);

  // Call backend health endpoint to ensure API is reachable
  const r = await request.get('/api/health');
  expect(r.ok()).toBeTruthy();
  const json = await r.json();
  expect(json.status).toBe('ok');
});
