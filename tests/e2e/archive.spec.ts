// Putting things away, on a phone: a design archived for both of you and
// restored, a project renamed, archived, restored, and a test project deleted for good.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

const PROJECT = '/p/sample-shirt';

/** Each person in their own browser, as on their own phones. */
async function phone(browser: Browser, who: 'Erin' | 'Joel'): Promise<{ page: Page; errors: string[] }> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors = await watchErrors(page);
  await signIn(page, who);
  return { page, errors };
}

async function signIn(page: Page, who: 'Erin' | 'Joel') {
  await page.goto('/');
  await pickUser(page, who);
}

async function options(page: Page): Promise<{ id: string; source: string }[]> {
  return ((await (await page.request.get(PROJECT.replace('/p/', '/api/projects/'))).json()) as { options: { id: string; source: string }[] }).options;
}

test('a design archived for both of you, and back again', async ({ browser }) => {
  const { page, errors } = await phone(browser, 'Erin');
  const all = await options(page);
  const target = all.find((o) => o.source !== 'seed')!;

  await page.goto(`${PROJECT}/o/${target.id}`);
  await page.getByRole('button', { name: 'Archive for both of us' }).click();
  await expect(page.getByText(/This design is out of Browse and Favorites for both of you/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Love it' })).toHaveCount(0);
  expect((await options(page)).map((o) => o.id)).not.toContain(target.id);

  // Joel doesn't see it either, except under Archived.
  const joel = await phone(browser, 'Joel');
  await joel.page.goto(`${PROJECT}/favorites`);
  await joel.page.getByRole('button', { name: /^Archived/ }).click();
  await expect(joel.page.getByText(/Archived .* by Erin/)).toBeVisible();
  await joel.page.getByRole('button', { name: 'Restore' }).click();
  await expect(joel.page.getByText('Restored. It’s back in Favorites and Browse.')).toBeVisible();
  expect((await options(joel.page)).map((o) => o.id)).toContain(target.id);
  expect([...errors, ...joel.errors]).toEqual([]);
});

test('projects: rename, archive, restore, and delete a test one for good', async ({ page }) => {
  const errors = await watchErrors(page);
  page.on('dialog', (d) => d.accept());
  await signIn(page, 'Joel');

  // A throwaway project to practice on.
  const created = await page.request.post('/api/projects', {
    headers: { 'content-type': 'application/json' },
    data: {
      occasion: 'birthday',
      basics: { title: 'Maya’s 40th', people: ['Maya'], dates: '', number: '40', year: '2026', place: '' },
      copy: { headline: 'Forty', tagline: 'and fabulous', extra: '' },
    },
  });
  expect(created.ok()).toBe(true);
  const { project } = (await created.json()) as { project: { id: string } };

  // Rename it so it can be told apart.
  await page.goto(`/p/${project.id}`);
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Maya’s 40th (test)');
  await page.getByRole('button', { name: 'Save the name' }).click();
  await expect(page.getByText('Renamed to “Maya’s 40th (test)”')).toBeVisible();

  // Archive: off the home screen, into Archived with who and when.
  await page.getByRole('button', { name: 'Archive this project' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /Maya’s 40th/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Archived \(1\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Archived' })).toBeVisible();
  await expect(page.getByText(/Started .* by you · archived .* by you/)).toBeVisible();

  // Opening it shows the banner; restoring puts it back.
  await page.getByRole('link', { name: 'Maya’s 40th (test)', exact: true }).click();
  await expect(page.getByRole('status').getByText(/Archived .* by you/)).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Maya’s 40th \(test\)/ }).first()).toBeVisible();

  // Archive again, then delete for good: the name has to be typed.
  await page.goto(`/p/${project.id}`);
  await page.getByRole('button', { name: 'Archive this project' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/archived');
  await page.getByRole('button', { name: 'Delete for good' }).click();
  const confirm = page.getByRole('button', { name: 'Delete it for good' });
  await expect(confirm).toBeDisabled();
  await page.getByRole('textbox', { name: 'Project name to confirm' }).fill('maya’s 40th (test)');
  await confirm.click();
  await expect(page.getByText('Nothing archived.')).toBeVisible();
  expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);

  // Activity keeps the whole story, including the delete.
  await page.goto('/');
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  const log = page.getByRole('main').getByRole('listitem');
  await expect(log.first()).toContainText('You deleted Maya’s 40th (test) for good');
  await expect(log.filter({ hasText: 'You renamed Maya’s 40th (test) (from “Maya’s 40th”)' })).toHaveCount(1);
  await expect(log.filter({ hasText: /^You archived Maya’s 40th \(test\)/ })).toHaveCount(2);
  await expect(log.filter({ hasText: 'You restored Maya’s 40th (test)' })).toHaveCount(1);
  await expect(log.filter({ hasText: 'You started Maya’s 40th' })).toHaveCount(1);
  await expect(log.filter({ hasText: /^You signed in/ })).toHaveCount(0); // the laptop picker isn't a real sign-in
  // A deleted project's name isn't a link any more.
  await expect(page.getByRole('main').getByRole('link', { name: 'Maya’s 40th (test)' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
