// Walks every screen and sheet at a few phone sizes and reports anything a
// bottom bar still covers once you've scrolled as far as you can. Saves an
// at-rest and a scrolled-to-the-bottom screenshot of each for a look by eye.
//
// Needs a dev server with the laptop sign-in (no link tokens, no Supabase):
//   DATA_DIR=/tmp/ui-data npx next dev -p 3300
//   node scripts/ui-audit.mjs ./shots/audit http://localhost:3300
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? './shots/audit';
const base = process.argv[3] ?? 'http://localhost:3300';
fs.mkdirSync(out, { recursive: true });

// Visible page area with the browser's own bars showing, roughly.
const SIZES = [
  { name: 'promax', width: 430, height: 740 },
  { name: 'iphone', width: 390, height: 664 },
  { name: 'se', width: 375, height: 548 },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
];
const only = process.env.SIZES?.split(',');

/** Runs in the page: what's under a bottom bar right now? */
function coveredNow() {
  const H = innerHeight;
  const W = innerWidth;
  const all = [...document.querySelectorAll('body *')];
  const scope = document.querySelector('[role="dialog"]') ?? document.body;
  const bars = all.filter((el) => {
    const cs = getComputedStyle(el);
    if ((cs.position !== 'fixed' && cs.position !== 'sticky') || cs.pointerEvents === 'none') return false;
    if (!scope.contains(el) || el === scope) return false;
    const r = el.getBoundingClientRect();
    return r.height > 30 && r.height < H * 0.5 && r.width > Math.min(W, 576) * 0.6 && r.bottom > H * 0.6 && el.querySelector('button, a');
  });
  const found = [];
  for (const bar of bars) {
    const b = bar.getBoundingClientRect();
    // The bar itself, plus the top half of the fade drawn above it.
    const top = b.top - 16;
    for (const el of all) {
      if (bar.contains(el) || el.contains(bar) || !scope.contains(el)) continue;
      if (!el.matches('input, textarea, select, button, a, h1, h2, h3, p, li, label, summary, [role="img"], [role="radio"]')) continue;
      // Folded-away sections and full-screen backdrops aren't content.
      if (el.closest('details:not([open])') && !el.closest('summary')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.height > H * 0.8) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const v = Math.min(r.bottom, b.bottom) - Math.max(r.top, top);
      const h = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      if (v > 6 && h > 6) {
        const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
        found.push(`${el.tagName.toLowerCase()} "${text}" (${Math.round(v)}px under)`);
      }
    }
  }
  return { bars: bars.map((b) => Math.round(b.getBoundingClientRect().bottom)), height: H, found: [...new Set(found)] };
}

/** Scrolls the page (or the open sheet) as far down as it goes. */
async function toBottom(page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"] .overflow-y-auto');
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
    else window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(400);
}

const report = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

for (const size of SIZES.filter((s) => !only || only.includes(s.name))) {
  const mobile = size.mobile !== false;
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);

  const check = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${size.name}-${name}-1rest.png` });
    await toBottom(page);
    const r = await page.evaluate(coveredNow);
    await page.screenshot({ path: `${out}/${size.name}-${name}-2bottom.png` });
    report.push({ size: size.name, name, ...r });
    const flag = r.found.length ? 'FAIL' : 'ok  ';
    console.log(`${flag} ${size.name.padEnd(7)} ${name.padEnd(22)} bars@${r.bars.join(',') || '-'}/${r.height}${r.found.length ? `  covered: ${r.found.join('; ')}` : ''}`);
  };
  const sheet = async (name, open) => {
    await open();
    await page.locator('[role="dialog"]').waitFor();
    await check(name);
    await page.keyboard.press('Escape');
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  };

  // Joel, via the laptop picker.
  await page.goto(base);
  await page.getByRole('button', { name: "I'm Joel" }).click();
  await page.getByRole('heading', { name: /Joel\./ }).waitFor();
  await check('home');

  // A new graduation project, like the screenshots.
  await page.getByRole('main').getByRole('link', { name: /Start something new/ }).click();
  await page.getByRole('heading', { name: 'What are we celebrating?' }).waitFor();
  await check('new-1-occasion');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: /Graduation/ }).click();
  await page.getByRole('heading', { name: 'The basics' }).waitFor();
  await page.getByRole('textbox', { name: 'What should we call it?' }).fill("Sam's Graduation");
  await page.getByRole('textbox', { name: /Who/ }).fill('Sam');
  await page.getByRole('textbox', { name: 'When?' }).fill('May 2027');
  await check('new-2-basics');
  await page.getByRole('button', { name: 'Next: the words' }).click();
  await page.getByRole('heading', { name: 'Pick the words' }).waitFor();
  await check('new-3-words');
  await page.getByRole('button', { name: 'Make it' }).click();
  await page.waitForURL(/\/p\/sams-graduation-/);
  const grad = new URL(page.url()).pathname.replace(/\/$/, '');

  for (const [label, p] of [
    ['grad', grad],
    ['sample', '/p/sample-shirt'],
  ]) {
    await page.goto(base + p);
    await page.getByRole('heading', { name: "Let's make the shirt" }).waitFor();
    await check(`${label}-hub`);
    await page.goto(`${base}${p}/vibe`);
    await check(`${label}-vibe`);
    await page.goto(`${base}${p}/words`);
    await check(`${label}-words`);
    await page.goto(`${base}${p}/browse`);
    await page.getByRole('button', { name: 'Love it' }).waitFor();
    await check(`${label}-browse`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Love it' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Look closer' }).click();
    await page.waitForURL(/\/o\//);
    await check(`${label}-option`);
    await sheet(`${label}-option-tweak`, () => page.getByRole('button', { name: 'Change something' }).click());
    await sheet(`${label}-option-words`, () => page.getByRole('button', { name: 'Different words' }).click());
    await sheet(`${label}-option-colors`, () => page.getByRole('button', { name: 'Colors', exact: true }).click());
    await page.goto(`${base}${p}/favorites`);
    await check(`${label}-favorites`);
    await page.goto(`${base}${p}/back`);
    await page.getByRole('heading', { name: 'The back' }).waitFor();
    await check(`${label}-back`);
    await sheet(`${label}-back-facts`, async () => {
      await page.getByRole('button', { name: 'Edit the details' }).click();
      await page.locator('[role="dialog"] details summary').nth(1).click();
    });
    await page.locator('a[href*="/b/"]').first().click();
    await page.waitForURL(/\/b\//);
    await check(`${label}-back-detail`);
    await page.goto(`${base}${p}/approve`);
    await check(`${label}-approve`);
  }

  // Approve the graduation shirt and look at the done screen.
  await page.goto(`${base}${grad}/approve`);
  await page.getByText("I've checked every word").click();
  await page.getByRole('button', { name: 'Yes, this is the one' }).click();
  await page.getByText('For the print shop').waitFor({ timeout: 120_000 });
  await check('grad-done');

  await page.goto(`${base}/admin`);
  await check('admin');

  // Archive the graduation project and look at the archive.
  await page.goto(`${base}${grad}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Archive this project' }).click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/archived`);
  await check('archived');
  await page.goto(`${base}${grad}`);
  await check('grad-archived-project');
  // Everything that just happened, then one project's history.
  await page.goto(`${base}/activity`);
  await check('activity');
  await page.goto(`${base}/activity?project=${encodeURIComponent(grad.split('/').pop())}`);
  await check('grad-history');
  await page.goto(`${base}/privacy`);
  await check('privacy');
  await page.goto(`${base}/terms`);
  await check('terms');
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.found.length);
console.log(`\n${report.length} views checked, ${bad.length} with something under a bottom bar.`);
process.exitCode = bad.length ? 1 : 0;
