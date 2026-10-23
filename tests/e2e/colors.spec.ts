// Exact colors for particular words, on a phone: the Colors panel, "Change
// something" reading "make the Grand sunshine" without Claude, and the approve
// page saying when a picked color won't show on the shirt.
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

const PROJECT = '/p/sample-shirt';
const CORAL = '#F2654E';
const SUNSHINE = '#FFD166';

test('Erin colors just the words she wants', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/');
  await pickUser(page, 'Erin');
  const seed = (await options(page)).find((o) => o.source === 'seed')!;
  await page.goto(`${PROJECT}/o/${seed.id}`);

  // Coral big words: the preview changes straight away, nothing saves yet.
  await page.getByRole('button', { name: 'Colors' }).click();
  const sheet = page.getByRole('dialog', { name: 'Colors' });
  await expect(sheet.getByRole('radio', { name: 'Big words' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Coral', exact: true }).click();
  await expect(sheet.getByRole('img', { name: 'Preview with these colors' }).locator(`path[fill="${CORAL}"]`).first()).toBeAttached();
  await expect(sheet.getByRole('button', { name: 'Coral', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Tapping the small words on the preview picks them, and the spot tapped really is them.
  const spot = await sheet.evaluate((dialog) => {
    const overlay = [...dialog.querySelectorAll<HTMLElement>('div[aria-hidden="true"]')].find((d) => d.offsetParent && d.querySelector('path[fill="#000003"]'))!;
    const r = overlay.querySelector('path[fill="#000003"]')!.getBoundingClientRect();
    for (let y = r.top + 1; y < r.bottom; y += 1)
      for (let x = r.left + 1; x < r.right; x += 1) {
        if ((document.elementFromPoint(x, y) as Element | null)?.getAttribute('fill') !== '#000003') continue;
        overlay.style.pointerEvents = 'none';
        const below = document.elementFromPoint(x, y)?.getAttribute('fill');
        overlay.style.pointerEvents = '';
        return { x, y, below };
      }
    return null;
  });
  expect(spot).not.toBeNull();
  await page.mouse.click(spot!.x, spot!.y);
  await expect(sheet.getByRole('radio', { name: 'Small words' })).toBeChecked();
  const smallInk = await sheet.getByRole('radio', { name: 'Small words' }).locator('span').first().evaluate((el) => {
    const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number);
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  });
  expect(spot!.below?.toUpperCase()).toBe(smallInk);

  // Sunshine on a white shirt gets a warning; back to the scheme clears it.
  await sheet.getByRole('radio', { name: 'Quoted words' }).click();
  await sheet.getByRole('button', { name: 'Sunshine' }).click();
  await expect(sheet.getByText('Sunshine quoted words will be hard to read on a white shirt.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Back to the color scheme' }).click();
  await expect(sheet.getByText(/hard to read/)).toHaveCount(0);

  // Saving is a server round trip (and, on the dev server, the route's first compile), so it gets longer than the default.
  await sheet.getByRole('button', { name: 'Save as a new version' }).click();
  await expect(page.getByText('Made a new version: big words: coral')).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(new RegExp(seed.id));
  await expect(page.getByText('Its own colors')).toBeVisible();
  const coral = await optionAt(page);
  expect(coral.payload.colors).toEqual({ headline: CORAL });
  expect({ ...coral.payload, colors: undefined }).toEqual({ ...seed.payload, colors: undefined });

  // In words: "the Grand" is the quoted word, and the coral stays.
  await page.getByRole('button', { name: 'Change it' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('make the Grand sunshine yellow');
  await page.getByRole('button', { name: 'Make it', exact: true }).click();
  await expect(page.getByText('Made a new version: quoted words: sunshine')).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(new RegExp(coral.id));
  const sunny = await optionAt(page);
  expect(sunny.payload.colors).toEqual({ headline: CORAL, emphasis: SUNSHINE });
  expect(sunny.payload.palette).toBe(seed.payload.palette);

  // Picked colors stay put on any shirt, so the approve page says when one won't show.
  await page.goto(`${PROJECT}/approve?option=${sunny.id}`);
  await page.getByRole('radiogroup', { name: 'Shirt color' }).getByRole('radio', { name: 'Sunshine' }).click();
  await expect(page.getByText('The sunshine quoted words will be hard to read on a sunshine shirt.', { exact: false })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Shirt color' }).getByRole('radio', { name: 'Navy' }).click();
  await expect(page.getByText(/hard to read/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

interface Option {
  id: string;
  source: string;
  payload: Record<string, unknown> & { colors?: Record<string, string>; palette: string };
}

async function options(page: Page): Promise<Option[]> {
  return ((await (await page.request.get(PROJECT.replace('/p/', '/api/projects/'))).json()) as { options: Option[] }).options;
}

/** The design whose page this is. */
async function optionAt(page: Page): Promise<Option> {
  const id = new URL(page.url()).pathname.split('/').pop();
  return (await options(page)).find((o) => o.id === id)!;
}
