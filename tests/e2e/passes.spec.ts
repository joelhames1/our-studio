// Changing your mind: Undo steps back through recent swipes (even after leaving
// Browse), and passes wait on a private Passed tab.
import { expect, test } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

const PROJECT = '/p/sample-shirt';

test('Undo steps back, and passes can be brought back', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/');
  await pickUser(page, 'Joel');
  await page.goto(`${PROJECT}/browse`);
  const count = async () => Number((await page.getByText(/to look at/).textContent())!.match(/\d+/)![0]);
  const start = await count();
  const react = (name: string) => Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.getByRole('button', { name, exact: true }).click()]);

  await react('Pass');
  await react('Pass');
  await react('Maybe');
  await expect(page.getByText(`${start - 3} to look at`)).toBeVisible();

  // Leave and come back: Undo still remembers.
  await page.goto(`${PROJECT}/favorites`);
  await page.goto(`${PROJECT}/browse`);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.getByRole('button', { name: 'Undo last swipe' }).click()]);
  await expect(page.getByText(`${start - 2} to look at`)).toBeVisible();
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.getByRole('button', { name: 'Undo last swipe' }).click()]);
  await expect(page.getByText(`${start - 1} to look at`)).toBeVisible();

  // The other pass is on the Passed tab, only for you; bring it back with a love.
  await page.goto(`${PROJECT}/favorites?tab=passed`);
  await expect(page.getByText('Only you can see these.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Passed\s*1/ })).toBeVisible();
  await page.locator('a[href*="/o/"]').first().click();
  await page.waitForURL(/\/o\//);
  await expect(page.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.getByRole('button', { name: 'Love', exact: true }).click()]);
  await page.goto(`${PROJECT}/favorites?tab=passed`);
  await expect(page.getByText('You haven’t passed on anything.')).toBeVisible();

  expect(errors).toEqual([]);
});
