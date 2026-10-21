// Screenshots the 3D lab page from several angles and garments into one sheet.
// Usage: node scripts/shots-3d.mjs <outDir> [baseUrl]   (dev server running)
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:3000';
const combos = (process.env.COMBOS ?? 'tee:white:joel:front,tee:white:joel:three-quarter,tee:white:joel:back,longsleeve:navy:erin:front,hoodie:heather:joel:front,hoodie:teal:erin:back')
  .split(',')
  .map((c) => c.split(':'));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let i = 0;
for (const [style, color, fit, angle] of combos) {
  await page.goto(`${base}/lab/3d?style=${style}&color=${color}&fit=${fit}&angle=${angle}`);
  await page.waitForFunction(() => window.__labReady === true, null, { timeout: 90_000 });
  await page.screenshot({ path: `${out}/3d-${i++}-${style}-${color}-${fit}-${angle}.png` });
  console.log('shot', style, color, fit, angle);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
