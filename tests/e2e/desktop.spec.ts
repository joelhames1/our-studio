// On a laptop: a sidebar of projects, keyboard shortcuts, and panels that open
// down the right-hand side. Phones get none of it.
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

const PROJECT = '/p/sample-shirt';

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('the sidebar, keyboard browsing and side panels', async ({ page }) => {
    const errors = await watchErrors(page);
    await page.goto('/');
    await pickUser(page, 'Joel');

    // Every project is a click away.
    const sidebar = page.getByRole('navigation', { name: 'Projects' });
    await sidebar.getByRole('link', { name: /Sample Shirt/ }).click();
    await expect(page).toHaveURL(new RegExp(`${PROJECT}$`));
    await expect(sidebar.getByRole('link', { name: /Sample Shirt/ })).toHaveAttribute('aria-current', 'page');

    // Browse with the arrow keys, undo with Z, Enter to look closer.
    await page.goto(`${PROJECT}/browse`);
    const count = async () => Number((await page.getByText(/to look at/).textContent())!.match(/\d+/)![0]);
    const start = await count();

    // Beside the card: what to change, and what's next. Typing there isn't a shortcut.
    const panel = page.getByRole('complementary', { name: 'This design' });
    await expect(panel.getByRole('textbox', { name: 'What should change?' })).toBeVisible();
    await expect(panel.getByRole('link', { name: /^Up next:/ }).first()).toBeVisible();
    await panel.getByRole('textbox', { name: 'What should change?' }).fill('bigger');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`${start} to look at`)).toBeVisible();
    await panel.getByRole('textbox', { name: 'What should change?' }).fill('');
    await page.keyboard.press('Escape');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.keyboard.press('ArrowRight')]);
    await expect(page.getByText(`${start - 1} to look at`)).toBeVisible();
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.keyboard.press('z')]);
    await expect(page.getByText(`${start} to look at`)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/o\//);

    // The design on the left, everything you can do with it on the right.
    const preview = (await page.getByRole('radiogroup', { name: 'Zoom' }).boundingBox())!;
    const controls = (await page.getByRole('button', { name: 'More like this' }).boundingBox())!;
    expect(preview.x + preview.width).toBeLessThan(controls.x);

    // A panel opens down the right-hand side, over the controls but not the design.
    await page.getByRole('button', { name: 'Change something' }).click();
    const drawer = page.locator('.sheet-panel');
    const box = (await drawer.boundingBox())!;
    expect(box.x).toBeGreaterThan(900);
    expect(box.x).toBeGreaterThan(preview.x + preview.width);
    expect(box.height).toBeGreaterThan(850);
    await drawer.getByRole('textbox').fill('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // ? lists the shortcuts.
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('compare a few side by side, and browse as a grid', async ({ page }) => {
    const errors = await watchErrors(page);
    await page.goto('/');
    await pickUser(page, 'Joel');

    // Pick three from their own pages, then compare them.
    for (const id of await designIds(page, 3)) {
      await page.goto(`${PROJECT}/o/${id}`);
      await page.getByRole('button', { name: 'Add to compare' }).click();
    }
    await page.getByRole('link', { name: /Compare 3/ }).click();
    await expect(page.getByRole('heading', { name: '3 side by side' })).toBeVisible();
    const tops = await page.locator('main article').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    const shared = page.url();
    await page.locator('main article').first().getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('heading', { name: '2 side by side' })).toBeVisible();
    expect(page.url()).not.toBe(shared);

    // The grid: L hearts the highlighted one, Z takes it back, and it stays taken back.
    await page.goto(`${PROJECT}/browse`);
    await page.getByRole('radio', { name: 'Grid' }).click();
    const count = async () => Number((await page.getByText(/to look at/).textContent())!.match(/\d+/)![0]);
    const start = await count();
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.keyboard.press('l')]);
    await expect(page.getByText(`${start - 1} to look at`)).toBeVisible();
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), page.keyboard.press('z')]);
    await expect(page.getByText(`${start} to look at`)).toBeVisible();
    await page.reload();
    await expect(page.getByText(`${start} to look at`)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('a phone keeps its own layout', async ({ page }) => {
  await page.goto('/');
  await pickUser(page, 'Joel');
  await expect(page.getByRole('navigation', { name: 'Projects' })).toBeHidden();
  // Panels still come up from the bottom.
  await page.goto(`${PROJECT}/browse`);
  await page.getByRole('link', { name: 'Look closer' }).click();
  await expect(page).toHaveURL(/\/o\//);
  await page.getByRole('button', { name: 'Change something' }).click();
  const box = (await page.locator('.sheet-panel').boundingBox())!;
  // The full width of the screen (give or take its pop-in animation), at the bottom.
  expect(box.x).toBeLessThan(10);
  expect(box.width).toBeGreaterThan(370);
  expect(box.y).toBeGreaterThan(100);

  // A comparison sent from a laptop opens two across, to swipe through.
  await page.goto(`${PROJECT}/compare?ids=${(await designIds(page, 2)).join(',')}`);
  await expect(page.getByRole('heading', { name: '2 side by side' })).toBeVisible();
  const [a, b] = await page.locator('main article').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width })));
  expect(a.w).toBeLessThan(200);
  expect(b.x).toBeGreaterThan(a.x + a.w - 1);
});

/** The first few designs in the project, straight from its API (the page shares the sign-in). */
async function designIds(page: Page, n: number): Promise<string[]> {
  const state = (await (await page.request.get(PROJECT.replace('/p/', '/api/projects/'))).json()) as { options: { id: string }[] };
  return state.options.slice(0, n).map((o) => o.id);
}
