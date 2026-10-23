// Production smoke test: real link sign-in, the security headers, the CSP, and
// the main screens on a production build. Not part of the normal run.
//
//   export ERIN_LINK_TOKEN=$(openssl rand -hex 24) JOEL_LINK_TOKEN=$(openssl rand -hex 24)
//   npx next build && DATA_DIR=.data-smoke npx next start -p 3200 &
//   E2E_PROD=1 npx playwright test
//
// It uses whatever storage that server has, so point it at a laptop folder
// (no Supabase variables), never at the real database.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { watchErrors } from './watch';

const ERIN = process.env.ERIN_LINK_TOKEN ?? '';
const JOEL = process.env.JOEL_LINK_TOKEN ?? '';
const PROJECT = '/p/sample-shirt';

test.skip(!ERIN || !JOEL, 'Set ERIN_LINK_TOKEN and JOEL_LINK_TOKEN to the values the server was started with.');

async function signIn(browser: Browser, token: string, name: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = await watchErrors(page);
  await page.goto(`/k#${token}`);
  await expect(page.getByRole('heading', { name: new RegExp(`${name}\\.`) })).toBeVisible({ timeout: 30_000 });
  expect(page.url()).not.toContain('#');
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === 'studio_session')!;
  expect(session.httpOnly).toBe(true);
  expect(session.value).not.toContain(token);
  return { page, errors };
}

test('headers and policy on every page', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  const csp = h['content-security-policy'];
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
  expect(h['x-powered-by']).toBeUndefined();
  // A fresh nonce every time.
  const again = (await request.get('/')).headers()['content-security-policy'];
  expect(again).not.toBe(csp);
  // Dev-only screens and the laptop picker don't exist here; nor do old-style links.
  expect((await request.get('/lab/3d')).status()).toBe(404);
  expect((await request.post('/api/dev-login', { form: { who: 'joel' } })).status()).toBe(404);
  expect((await request.get(`/k/${JOEL}`)).status()).toBe(404);
  expect((await request.get('/api/projects/sample-shirt')).status()).toBe(401);
});

test('a wrong link is refused', async ({ page }) => {
  const errors = await watchErrors(page);
  await page.goto('/k#not-the-right-token-at-all-0000');
  await expect(page.getByText(/That link didn.t work/)).toBeVisible();
  expect(page.url()).toMatch(/\/k$/);
  await page.goto('/');
  await expect(page.getByText(/open the personal link you were sent/)).toBeVisible();
  // The privacy page and terms are public (Google's brand verification reads them).
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('sign in with real links, use the app, and refuse writes from elsewhere', async ({ browser }) => {
  const joel = await signIn(browser, JOEL, 'Joel');

  // Setup shows the links masked, and the page never carries Erin's token.
  await joel.page.getByRole('link', { name: 'Setup' }).click();
  await expect(joel.page.getByRole('heading', { name: 'Setup' })).toBeVisible();
  await expect(joel.page.getByText(`#${ERIN.slice(0, 4)}…${ERIN.slice(-4)}`)).toBeVisible();
  expect(await joel.page.content()).not.toContain(ERIN);
  const link = await joel.page.request.post('/api/admin/link', { data: { who: 'erin' } });
  expect((await link.json()).link).toMatch(new RegExp(`/k#${ERIN}$`));

  // The main screens render under the CSP.
  await joel.page.goto(PROJECT);
  await expect(joel.page.getByRole('heading', { name: "Let's make the shirt" })).toBeVisible();
  await joel.page.getByRole('link', { name: 'Start browsing' }).click();
  await expect(joel.page.locator('[role="img"] svg path').first()).toBeAttached();
  await joel.page.getByRole('link', { name: 'Look closer' }).click();
  await joel.page.getByRole('radio', { name: '3D' }).click();
  await expect(joel.page.locator('[data-testid="tryon-3d"][data-state="ready"]')).toBeVisible({ timeout: 90_000 });
  await joel.page.goto(`${PROJECT}/back`);
  await expect(joel.page.getByRole('heading', { name: 'The back print' })).toBeVisible();
  await joel.page.goto(`${PROJECT}/approve`);
  await expect(joel.page.getByRole('heading', { name: 'Erin makes the final call' })).toBeVisible();

  // Writes from another site, or not as JSON, are refused even with a good session.
  const state = await (await joel.page.request.get(`/api/projects/sample-shirt`)).json();
  const optionId = state.options[0].id as string;
  const react = (headers: Record<string, string>, data: string) => joel.page.request.post(`${PROJECT.replace('/p/', '/api/projects/')}/react`, { headers, data });
  expect((await react({ 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, JSON.stringify({ optionId, value: 'love' }))).status()).toBe(403);
  expect((await react({ 'Content-Type': 'application/json', Origin: 'https://evil.example' }, JSON.stringify({ optionId, value: 'love' }))).status()).toBe(403);
  expect((await react({ 'Content-Type': 'text/plain', 'Sec-Fetch-Site': 'same-origin' }, JSON.stringify({ optionId, value: 'love' }))).status()).toBe(415);
  expect((await joel.page.request.post('/api/logout', { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  // Joel can't reopen or approve Erin's shirt.
  expect((await joel.page.request.post(`/api/projects/sample-shirt/reopen`, { data: {} })).status()).toBe(403);

  // Erin approves, and the print package builds on the production server.
  const erin = await signIn(browser, ERIN, 'Erin');
  const approved = await erin.page.request.post(`/api/projects/sample-shirt/approve`, {
    data: { optionId, garment: 'tee', color: 'white', preset: 'standard', sizes: [{ who: 'Erin', size: 'M', qty: 1 }] },
  });
  expect(approved.status()).toBe(200);
  await erin.page.goto(`${PROJECT}/done`);
  await expect(erin.page.getByText('For the print shop')).toBeVisible({ timeout: 120_000 });
  await expect(erin.page.getByRole('button', { name: /Changed your mind/ })).toBeVisible();
  await joel.page.goto(`${PROJECT}/done`);
  await expect(joel.page.getByText('Erin can reopen it.')).toBeVisible();

  expect(joel.errors).toEqual([]);
  expect(erin.errors).toEqual([]);
});
