// The one-time OK about AI, and signing out. Runs first (files go in order, one
// at a time, on a fresh data folder), so Erin hasn't agreed yet.
import { expect, test } from '@playwright/test';
import { watchErrors } from './watch';

test('Erin agrees to how AI is used before anything goes to it, once, and can sign out', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: "I'm Erin" }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Erin' })).toBeVisible();
  // Nothing has been sent anywhere, and nothing can be until she says OK.
  const draft = await page.request.post('/api/projects/draft', { data: { text: 'A shirt for Sam’s graduation in June' } });
  expect(draft.status()).toBe(403);
  expect((await draft.json()).error).toMatch(/agree to how Our Studio uses AI/);
  // Every page waits for it, but the privacy policy it links to opens.
  await page.goto('/p/sample-shirt');
  await expect(page.getByRole('heading', { name: 'Welcome, Erin' })).toBeVisible();
  await page.getByRole('link', { name: 'privacy policy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: "OK, let’s start" }).click();
  await expect(page.getByRole('heading', { name: /Erin\./ })).toBeVisible();
  await page.goto('/activity');
  await expect(page.getByText('You agreed to how Our Studio uses AI')).toBeVisible();

  // Signing out, from the foot of the sidebar; signing back in doesn't ask again.
  await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: "I'm Erin" })).toBeVisible();
  await page.getByRole('button', { name: "I'm Erin" }).click();
  await expect(page.getByRole('heading', { name: /Erin\./ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('on a phone, signing out is at the foot of the home screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: "I'm Joel" }).click();
  const ok = page.getByRole('button', { name: "OK, let’s start" });
  await ok.click();
  await expect(page.getByRole('heading', { name: /Joel\./ })).toBeVisible();
  // Setup's "Back up now" saves a copy, which is never served to anyone, Joel included.
  const backup = await page.request.post('/api/admin/test', { data: { target: 'backup' } });
  expect(((await backup.json()) as { ok: boolean; message: string }).message).toMatch(/^Saved \d+ rows to backups\/day-\d\d\.json/);
  expect((await page.request.get('/api/assets/backups/latest.json')).status()).toBe(404);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: "I'm Joel" })).toBeVisible();
});
