// Joel starts a birthday shirt for Maya: occasion, basics, words, then the usual
// browse, back and approve. He started it, so he gets the final say.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { watchErrors } from './watch';
import { pickUser } from './signin';

async function signIn(browser: Browser, who: 'erin' | 'joel'): Promise<Page & { errors: string[] }> {
  const ctx = await browser.newContext();
  const page = (await ctx.newPage()) as Page & { errors: string[] };
  page.errors = await watchErrors(page);
  await page.goto('/');
  await pickUser(page, who === 'erin' ? 'Erin' : 'Joel');
  return page;
}

const saved = (p: Page) => p.waitForResponse((r) => r.url().endsWith('/react') && r.ok());

test('Joel starts a birthday shirt for Maya and gets the final say', async ({ browser }) => {
  const joel = await signIn(browser, 'joel');
  await joel.getByRole('link', { name: /Start something new/ }).click();
  await expect(joel.getByRole('heading', { name: 'What are we celebrating?' })).toBeVisible();
  await joel.getByRole('button', { name: /Birthday/ }).click();

  await joel.getByRole('textbox', { name: 'What should we call it?' }).fill("Maya's 40th");
  await joel.getByRole('textbox', { name: 'Whose birthday?' }).fill('Maya');
  await joel.getByRole('textbox', { name: 'When?' }).fill('Jun 14, 2027');
  await joel.getByRole('textbox', { name: 'Turning' }).fill('40');
  await joel.getByRole('textbox', { name: 'Born in' }).fill('1987');
  await joel.getByRole('button', { name: 'Next: the words' }).click();

  // Six ideas written from the basics; pick one and change a line.
  await expect(joel.getByRole('radiogroup', { name: 'Word ideas' }).getByRole('radio')).toHaveCount(6);
  await joel.getByRole('radio', { name: /Vintage 1987/ }).click();
  await expect(joel.getByRole('textbox', { name: 'Big words' })).toHaveValue('Vintage 1987');
  await joel.getByRole('textbox', { name: 'Small words' }).fill('Forty and Fabulous');
  await joel.getByRole('button', { name: 'Make it' }).click();

  await expect(joel).toHaveURL(/\/p\/mayas-40th-/, { timeout: 30_000 });
  await expect(joel.getByRole('heading', { name: "Let's make the shirt" })).toBeVisible();
  await expect(joel.getByRole('link', { name: "Maya's 40th" })).toBeVisible();
  await expect(joel.getByText('Vintage 1987 · Forty and Fabulous')).toBeVisible();

  // Browse and love the first design.
  await joel.getByRole('link', { name: 'Start browsing' }).click();
  await expect(joel.getByText(/to look at/)).toBeVisible();
  await Promise.all([saved(joel), joel.getByRole('button', { name: 'Love', exact: true }).click()]);

  // The steps along the top tick as you go: one love does Browse and Favorites, and the back is optional.
  const steps = joel.getByRole('navigation', { name: 'Project steps' });
  await expect(steps.getByRole('link', { name: 'Browse', exact: true })).toHaveAccessibleDescription(/^Step 1 of 4, done/);
  await expect(steps.getByRole('link', { name: 'Favorites', exact: true })).toHaveAccessibleDescription(/^Step 2 of 4, done/);
  await expect(steps.getByRole('link', { name: 'Back print', exact: true })).toHaveAccessibleDescription('Step 3 of 4, optional');
  await expect(steps.getByRole('link', { name: 'Final', exact: true })).toHaveAccessibleDescription('Step 4 of 4');

  // The back: a jersey with Maya's name is one of the starters.
  await joel.getByRole('link', { name: 'Back print', exact: true }).click();
  await expect(joel.getByRole('heading', { name: 'The back print' })).toBeVisible();
  await expect(joel.getByRole('button', { name: 'Travel' })).toHaveCount(0);
  await Promise.all([saved(joel), joel.getByRole('button', { name: 'Love Name and number · Arched name' }).click()]);

  // Erin sees it on her home screen, and that it's Joel's call.
  const erin = await signIn(browser, 'erin');
  const card = erin.getByRole('link', { name: /Maya's 40th/ });
  await expect(card).toBeVisible();
  await expect(card.getByText('Joel has the final say')).toBeVisible();
  await card.click();
  await expect(erin).toHaveURL(/\/p\/mayas-40th-/);
  await erin.getByRole('link', { name: 'Final', exact: true }).click();
  await expect(erin.getByRole('heading', { name: 'Joel makes the final call' })).toBeVisible();

  // Joel approves, with the jersey on the back.
  await joel.goto(joel.url().replace(/\/back$/, '/approve'));
  await expect(joel.getByRole('heading', { name: 'Pick the final' })).toBeVisible();
  await expect(joel.getByRole('button', { name: 'Name and number · Arched name' })).toHaveAttribute('aria-pressed', 'true');
  await expect(joel.getByText('Vintage 1987', { exact: true })).toBeVisible();
  await expect(joel.getByText(/Each shirt gets its own name/)).toBeVisible();
  await joel.getByText("I've checked every word").click();
  await joel.getByRole('button', { name: 'Approve and make the print files' }).click();
  await expect(joel.getByRole('heading', { name: "It's the one!" })).toBeVisible({ timeout: 30_000 });
  await expect(joel.getByText('For the print shop')).toBeVisible({ timeout: 90_000 });
  await joel.getByText(/Individual files/).click();
  await expect(joel.getByRole('link', { name: /Back print file: Maya/ })).toBeVisible();
  const zip = (await joel.getByRole('link', { name: /Download everything/ }).getAttribute('href'))!;
  expect(zip).toContain('mayas-40th-print-package.zip');
  await expect(joel.getByText('You picked it')).toBeVisible();
  await expect(steps.getByRole('link', { name: 'Done', exact: true })).toHaveAccessibleDescription('Step 4 of 4, done');
  await expect(steps.getByRole('link', { name: 'Back print', exact: true })).toHaveAccessibleDescription('Step 3 of 4, done');

  // No Claude on a laptop, so no search (Joel runs the site, so he's told why); but sending a link works.
  await expect(joel.getByRole('heading', { name: 'Find a printer' })).toBeVisible();
  await expect(joel.getByText(/Printer search needs Claude/)).toBeVisible();
  await joel.getByRole('button', { name: 'Send to a print shop' }).click();
  const sheet = joel.getByRole('dialog', { name: 'Send to a printer' });
  const link = (await sheet.locator('.font-mono').textContent({ timeout: 30_000 }))!.trim();
  expect(link).toMatch(/\/s\/[a-z0-9]+\.[A-Za-z0-9_-]{32}$/);
  await expect(sheet.getByRole('link', { name: 'Write an email' })).toHaveAttribute('href', /^mailto:\?subject=T-shirt%20order/);

  // The printer opens it without signing in.
  const printer = await (await browser.newContext()).newPage();
  await printer.goto(link);
  await expect(printer.getByRole('heading', { name: "Maya's 40th" })).toBeVisible();
  await expect(printer.getByText('From Joel')).toBeVisible();
  await expect(printer.getByText(/1 × M \(Maya\)/)).toBeVisible();
  const file = await printer.request.get((await printer.getByRole('link', { name: /Everything \(zip\)/ }).getAttribute('href'))!);
  expect(file.status()).toBe(200);
  expect((await file.body()).length).toBeGreaterThan(100_000);
  // Nothing else in the app opens for them.
  expect((await printer.request.get('/api/projects/sample-shirt')).status()).toBe(401);

  // Turned off, it stops working at once.
  await sheet.getByRole('button', { name: 'Turn off this link' }).click();
  await expect(joel.getByText('Link turned off')).toBeVisible();
  await printer.reload();
  await expect(printer.getByRole('heading', { name: 'This link has ended' })).toBeVisible();

  expect(joel.errors).toEqual([]);
  expect(erin.errors).toEqual([]);
});
