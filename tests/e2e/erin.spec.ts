// Erin's whole journey on a phone: browse, react, tweak, change the words,
// match with Joel, approve, and download the print package.
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { watchErrors } from './watch';
import { pickUser } from './signin';

const PROJECT = '/p/sample-shirt';

async function signIn(browser: Browser, who: 'erin' | 'joel'): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  (page as Page & { errors: string[] }).errors = await watchErrors(page);
  await page.goto('/');
  await pickUser(page, who === 'erin' ? 'Erin' : 'Joel');
  return page;
}

test('Erin designs, matches with Joel, and approves the shirt', async ({ browser }) => {
  const erin = await signIn(browser, 'erin');
  await expect(erin.getByText('Erin gets the final say')).toHaveCount(0);
  await erin.getByRole('link', { name: /Sample Shirt/ }).click();
  await expect(erin.getByRole('heading', { name: "Let's make the shirt" })).toBeVisible();

  // Browse: the first card is the original idea, rendered on a shirt.
  await erin.getByRole('link', { name: 'Start browsing' }).click();
  await expect(erin.getByText('The original idea')).toBeVisible();
  await expect(erin.locator('[role="img"] svg path').first()).toBeAttached();
  const before = Number((await erin.getByText(/to look at/).textContent())!.match(/\d+/)![0]);
  await erin.getByRole('button', { name: 'Love it' }).click();
  await expect(erin.getByText(`${before - 1} to look at`)).toBeVisible();

  // Undo puts it back.
  await erin.getByRole('button', { name: 'Undo' }).click();
  await expect(erin.getByText(`${before} to look at`)).toBeVisible();
  await erin.getByRole('button', { name: 'Love it' }).click();

  // More like this, and a plain-English tweak.
  await erin.getByRole('button', { name: 'More like this' }).click();
  await expect(erin.getByText(/new variations up next/)).toBeVisible();
  await erin.getByRole('button', { name: 'Change something' }).click();
  await erin.getByRole('dialog').getByRole('textbox').fill('more blue and bigger words');
  await erin.getByRole('button', { name: 'Make it', exact: true }).click();
  await expect(erin.getByText(/Made a new version/)).toBeVisible();

  // Swiping works too.
  const card = erin.locator('.touch-pan-y').first();
  const box = (await card.boundingBox())!;
  await erin.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await erin.mouse.down();
  await erin.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 8 });
  await erin.mouse.up();

  // Pick a vibe.
  await erin.getByRole('link', { name: 'Vibe', exact: true }).click();
  await erin.getByRole('button', { name: /Boarding Pass/ }).click();
  await erin.getByRole('button', { name: /Show me that vibe/ }).click();
  await expect(erin).toHaveURL(new RegExp(`${PROJECT}/browse`));

  // Change the words.
  await erin.getByRole('link', { name: 'Words', exact: true }).click();
  await erin.getByRole('textbox', { name: /Small words/ }).fill("Let's Go, Finally!");
  await erin.getByRole('button', { name: 'Use these words' }).click();
  await expect(erin).toHaveURL(new RegExp(`${PROJECT}/browse`));

  // Practice artwork (no image key on a laptop) from the detail page.
  await erin.goto(`${PROJECT}/browse`);
  await erin.getByRole('link', { name: 'Look closer' }).click();

  // 3D try-on: renders a real picture, spins round, switches mannequin.
  await erin.getByRole('radio', { name: '3D' }).click();
  const tryOn = erin.locator('[data-testid="tryon-3d"][data-state="ready"]');
  await expect(tryOn).toBeVisible({ timeout: 90_000 });
  const stats = await sharp(await tryOn.locator('canvas').screenshot()).stats();
  // A blank or failed canvas is one flat color; a rendered mannequin isn't.
  expect(Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev))).toBeGreaterThan(12);
  await erin.getByRole('button', { name: 'Back' }).click();
  await erin.getByRole('radio', { name: 'Regular' }).click();
  await expect(erin.locator('[data-testid="tryon-3d"]')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await erin.getByRole('radio', { name: 'Close-up' }).click();

  await erin.getByRole('button', { name: 'New artwork in this style' }).click();
  await erin.getByRole('button', { name: 'Paint something new' }).click();
  await expect(erin.getByText(/with fresh artwork/)).toBeVisible({ timeout: 60_000 });

  // The back: fix a stop on the route, heart the route back, see it in 3D.
  await erin.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(erin.getByRole('heading', { name: 'The back' })).toBeVisible();
  await erin.getByRole('button', { name: 'Edit the details' }).click();
  const details = erin.getByRole('dialog', { name: 'The details' });
  await details.getByText('The route').click();
  await details.getByRole('textbox', { name: 'Place' }).nth(1).fill('New York City');
  await details.getByRole('button', { name: 'Save the details' }).click();
  await expect(erin.getByText(/Details saved/)).toBeVisible();
  const routeBack = 'Flight Path · Departures line';
  await Promise.all([erin.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), erin.getByRole('button', { name: `Heart ${routeBack}` }).click()]);
  await expect(erin.getByRole('button', { name: `Unheart ${routeBack}` })).toBeVisible();
  await erin.getByRole('link', { name: routeBack }).click();
  await expect(erin.getByRole('heading', { name: routeBack })).toBeVisible();
  await erin.getByRole('button', { name: 'Winding route' }).click();
  await expect(erin.getByRole('heading', { name: 'Flight Path · Winding route' })).toBeVisible();
  await erin.getByRole('radio', { name: '3D' }).click();
  const backTryOn = erin.locator('[data-testid="tryon-3d"][data-state="ready"]');
  await expect(backTryOn).toBeVisible({ timeout: 90_000 });
  await erin.waitForTimeout(1500);
  const backStats = await sharp(await backTryOn.locator('canvas').screenshot()).stats();
  expect(Math.max(...backStats.channels.slice(0, 3).map((c) => c.stdev))).toBeGreaterThan(12);
  await erin.getByRole('radio', { name: 'Close-up' }).click();

  // Joel hearts the original too, and the route back.
  const joel = await signIn(browser, 'joel');
  await joel.goto(`${PROJECT}/browse`);
  await expect(joel.getByText('Erin loves this')).toBeVisible();
  // Wait for the heart to save before leaving the page.
  await Promise.all([joel.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), joel.getByRole('button', { name: 'Love it' }).click()]);
  await joel.goto(`${PROJECT}/back`);
  await expect(joel.getByText('Erin ♥').first()).toBeVisible();
  await Promise.all([joel.waitForResponse((r) => r.url().endsWith('/react') && r.ok()), joel.getByRole('button', { name: `Heart ${routeBack}` }).click()]);
  await expect(joel.getByText('Both', { exact: true })).toBeVisible();
  await joel.goto(`${PROJECT}/approve`);
  await expect(joel.getByRole('heading', { name: 'Erin makes the final call' })).toBeVisible();

  // Erin sees the match, then approves it.
  await erin.goto(`${PROJECT}/favorites`);
  await expect(erin.getByRole('button', { name: /You both love\s*1/ })).toBeVisible();
  await erin.getByRole('link', { name: /pick the final/ }).click();
  await expect(erin.getByText('SAM & ALEX’S 25TH “Grand” TOUR')).toBeVisible();
  // The back they both love is already picked, and its words are in the spelling check.
  await expect(erin.getByRole('button', { name: routeBack })).toHaveAttribute('aria-pressed', 'true');
  await expect(erin.getByText('NEW YORK CITY, NY')).toBeVisible();
  const approve = erin.getByRole('button', { name: 'Yes, this is the one' });
  await expect(approve).toBeDisabled();
  await erin.getByText("I've checked every word").click();
  await approve.click();

  await expect(erin.getByRole('heading', { name: "It's the one!" })).toBeVisible({ timeout: 30_000 });
  await expect(erin.getByText('For the print shop')).toBeVisible({ timeout: 90_000 });
  const zip = erin.getByRole('link', { name: /Everything \(zip\)/ });
  const href = (await zip.getAttribute('href'))!;
  const res = await erin.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('zip');
  const body = await res.body();
  expect(body.length).toBeGreaterThan(100_000);
  const files = Object.keys(unzipSync(new Uint8Array(body)));
  expect(files.some((f) => f.endsWith('print-file-back-12x14.4in.png'))).toBe(true);
  await expect(erin.getByRole('link', { name: /Back print file/ })).toBeVisible();

  expect((erin as Page & { errors: string[] }).errors).toEqual([]);
  expect((joel as Page & { errors: string[] }).errors).toEqual([]);
});
