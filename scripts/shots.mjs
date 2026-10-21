// Takes phone-sized screenshots of the main screens for a quick visual check.
// Usage: node scripts/shots.mjs <outDir> [baseUrl] [who]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:3000';
const who = process.argv[4] ?? 'erin';
const pages = (process.env.SHOTS ?? 'home,hub,vibe,words,browse,favorites').split(',');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(base);
await page.locator(`button[value="${who}"]`).click().catch(() => {});
await page.waitForLoadState('networkidle');
const id = 'sample-shirt';
const urls = {
  home: '/',
  hub: `/p/${id}`,
  vibe: `/p/${id}/vibe`,
  words: `/p/${id}/words`,
  browse: `/p/${id}/browse`,
  favorites: `/p/${id}/favorites`,
  approve: `/p/${id}/approve`,
  done: `/p/${id}/done`,
  detail3d: `/p/${id}/browse`,
  back: `/p/${id}/back`,
  backdetail: `/p/${id}/back`,
  back3d: `/p/${id}/back`,
  facts: `/p/${id}/back`,
  admin: '/admin',
};
for (const name of pages) {
  await page.goto(base + urls[name]);
  await page.waitForLoadState('networkidle');
  if (name === 'backdetail' || name === 'back3d') {
    await page.locator('a[href*="/b/"]').nth(Number(process.env.BACK_INDEX ?? 0)).click();
    await page.waitForURL(/\/b\//);
    if (name === 'back3d') {
      await page.getByRole('radio', { name: '3D' }).click();
      await page.locator('[data-testid="tryon-3d"][data-state="ready"]').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(2500);
    }
  }
  if (name === 'facts') {
    await page.getByRole('button', { name: 'Edit the details' }).click();
    await page.locator('details').nth(1).locator('summary').click();
    await page.getByRole('textbox', { name: 'Airport code' }).first().scrollIntoViewIfNeeded();
  }
  if (name === 'detail3d') {
    await page.getByRole('link', { name: 'Look closer' }).click();
    await page.getByRole('radio', { name: '3D' }).click();
    await page.locator('[data-testid="tryon-3d"][data-state="ready"]').waitFor({ timeout: 90_000 });
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL === '1' });
  console.log('shot', name);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
