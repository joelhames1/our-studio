// The pages anyone can open without signing in: the home page says what Our
// Studio is and links to the privacy page and terms (Google's brand
// verification checks for exactly that), and both read the same signed in.
import { expect, test } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

test('the home page, privacy page and terms are open to anyone', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Our Studio', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What it is' })).toBeVisible();
  await expect(page.getByText('Design together.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Invite only\. Some features use AI/)).toBeVisible();

  const about = page.getByRole('navigation', { name: 'About this site' });
  await about.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByText(/Last updated/)).toBeVisible();
  for (const section of ['Who can see what', 'What it keeps', /^Where it.s kept, and who else handles it$/, 'Information from Google', /^How long it.s kept, and removing it$/]) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Google API Services User Data Policy' })).toHaveAttribute('href', /api-services-user-data-policy/);

  await page.getByRole('navigation', { name: 'About this site' }).getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI and printers' })).toBeVisible();
  await page.getByRole('navigation', { name: 'About this site' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'What it is' })).toBeVisible();

  // Signed in, they're still there, and the home screen links to them.
  await pickUser(page, 'Erin');
  await page.getByRole('navigation', { name: 'About this site' }).getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
