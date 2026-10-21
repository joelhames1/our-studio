import { expect, type Page } from '@playwright/test';

/**
 * Signs in with the laptop's "I'm Erin / I'm Joel" picker and waits for the
 * home screen, saying OK to how AI is used the first time it's asked
 * (agree.spec.ts checks that screen properly).
 */
export async function pickUser(page: Page, name: 'Erin' | 'Joel') {
  await page.getByRole('button', { name: `I'm ${name}` }).click();
  const home = page.getByRole('heading', { name: new RegExp(`${name}\\.`) });
  const ok = page.getByRole('button', { name: "OK, let’s start" });
  await expect(home.or(ok)).toBeVisible();
  if (await ok.isVisible()) await ok.click();
  await expect(home).toBeVisible();
}
