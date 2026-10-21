// The security fixes: sessions, same-origin writes, spend holds, bad input,
// who can reopen, the SVG sanitiser and the print renderer's file guard.
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signedIn, tempRepo } from './helpers';
import { renderDesign } from '@/lib/design/render';
import { preset } from '@/lib/design/occasions';
import type { FontSet, ShirtDesign } from '@/lib/design/types';
import { api, body, fromOwnSite } from '@/lib/server/api';
import { HttpError, sessionCookie, userForLinkToken, userForSession, USERS } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { contentSecurityPolicy } from '@/lib/server/csp';
import { approve, reopen } from '@/lib/server/decisions';
import { assertEmbeddedOnly, renderPrintPng } from '@/lib/server/export/render';
import { loadAllFonts } from '@/lib/server/fonts';
import { ask, z } from '@/lib/server/llm/claude';
import { createProject } from '@/lib/server/projects';
import { download, falProvider } from '@/lib/server/providers/fal';
import { MAX_SVG_CHARS, sanitizeSvg } from '@/lib/server/providers/svg';
import { signSession, verifySession } from '@/lib/server/session';
import { reserveSpend, spentThisMonth } from '@/lib/server/spend';
import { ensureSeed, MAX_DESIGNS, projectState, remix, SEED_PROJECT_ID, updateBrief } from '@/lib/server/studio';
import { editOption } from '@/lib/server/tweaks';

const ERIN = 'e'.repeat(12) + '0123456789abcdef0123456789abcdef';
const JOEL = 'j'.repeat(12) + 'fedcba9876543210fedcba9876543210';
const KEYS = ['ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'SESSION_VERSION', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'VERCEL', 'MONTHLY_BUDGET_USD', 'ANTHROPIC_API_KEY', 'COST_PER_IMAGE_USD', 'IMAGE_QUALITY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const links = () => {
  process.env.ERIN_LINK_TOKEN = ERIN;
  process.env.JOEL_LINK_TOKEN = JOEL;
};

describe('sessions', () => {
  it('signs a session that only the right token verifies', () => {
    const tokens = { erin: ERIN, joel: JOEL };
    const t = (id: string) => tokens[id as keyof typeof tokens];
    const s = signSession('erin', ERIN, '1');
    expect(s).toMatch(/^v1\.erin\.\d+\.\d+\.[\w-]{43}$/);
    expect(s).not.toContain(ERIN);
    expect(verifySession(s, t, '1')).toBe('erin');
    // Tampering with anything breaks it.
    expect(verifySession(s.replace('v1.erin', 'v1.joel'), t, '1')).toBeNull();
    expect(verifySession(s.slice(0, -2) + (s.endsWith('A') ? 'BB' : 'AA'), t, '1')).toBeNull();
    const [, , iat] = s.split('.');
    expect(verifySession(s.replace(`.${iat}.`, `.${Number(iat) - 1}.`), t, '1')).toBeNull();
    // A new token for Erin signs Erin out; Joel stays in.
    const j = signSession('joel', JOEL, '1');
    const rotated = (id: string) => (id === 'erin' ? 'x'.repeat(40) : JOEL);
    expect(verifySession(s, rotated, '1')).toBeNull();
    expect(verifySession(j, rotated, '1')).toBe('joel');
    // A new SESSION_VERSION signs everyone out.
    expect(verifySession(s, t, '2')).toBeNull();
    // Expiry and clocks.
    const year = 365 * 86400 * 1000;
    expect(verifySession(s, t, '1', Date.now() + year + 60_000)).toBeNull();
    expect(verifySession(signSession('erin', ERIN, '1', Date.now() + 3600_000), t, '1')).toBeNull();
    for (const junk of ['', 'v1', 'v1.erin.1.2', 'v1.admin.1.2.x', 'v2.erin.1.2.x', 'v1.erin.a.b.c', ERIN, 'x'.repeat(500)]) {
      expect(verifySession(junk, t, '1'), junk.slice(0, 20)).toBeNull();
    }
  });

  it('trades a link token for a cookie that never contains it', async () => {
    tempRepo();
    links();
    expect(await userForLinkToken(ERIN)).toEqual(USERS.erin);
    expect(await userForLinkToken(JOEL)).toEqual(USERS.joel);
    for (const bad of [ERIN.slice(0, -1), ERIN + 'x', '', null, 42, { token: ERIN }, 'dev:erin']) expect(await userForLinkToken(bad)).toBeNull();
    const c = { ...sessionCookie('erin'), value: await signedIn('erin') };
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(c.value).not.toContain(ERIN);
    expect(await userForSession(c.value)).toEqual(USERS.erin);
    // Before Supabase, links sign sessions; a cookie that isn't on the list of browsers still doesn't count.
    expect(await userForSession(sessionCookie('erin').value)).toBeNull();
    // The raw link token is not a session.
    expect(await userForSession(ERIN)).toBeNull();
    process.env.SESSION_VERSION = '2';
    expect(await userForSession(c.value)).toBeNull();
  });

  it('ignores short tokens and keeps the laptop picker away from real data', async () => {
    tempRepo();
    process.env.ERIN_LINK_TOKEN = 'short';
    process.env.JOEL_LINK_TOKEN = 'also-too-short-123';
    expect(config.authConfigured).toBe(false);
    expect(config.weakTokens).toEqual(['ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN']);
    expect(await userForLinkToken('short')).toBeNull();

    expect(config.devLogin).toBe(true);
    const dev = await signedIn('joel');
    expect(await userForSession(dev)).toEqual(USERS.joel);
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    expect(config.devLogin).toBe(false);
    expect(await userForSession(dev)).toBeNull();
    delete process.env.SUPABASE_URL;
    process.env.VERCEL = '1';
    expect(config.devLogin).toBe(false);
    delete process.env.VERCEL;
    // Once real links exist, laptop sessions stop working.
    links();
    expect(config.devLogin).toBe(false);
    expect(await userForSession(dev)).toBeNull();
  });
});

describe('writes only from the app itself', () => {
  const req = (method: string, headers: Record<string, string>, payload?: string) =>
    new Request('https://studio.example/api/x', { method, headers: { host: 'studio.example', ...headers }, body: payload });
  const handler = api(async (r) => ({ got: await body<{ a: number }>(r) }));
  const call = (r: Request) => handler(r, { params: Promise.resolve({}) });

  it('checks where requests come from', () => {
    expect(fromOwnSite(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(fromOwnSite(req('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(fromOwnSite(req('POST', { 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(fromOwnSite(req('POST', { origin: 'https://studio.example' }))).toBe(true);
    expect(fromOwnSite(req('POST', { origin: 'https://evil.example' }))).toBe(false);
    expect(fromOwnSite(req('POST', { origin: 'null' }))).toBe(false);
  });

  it('refuses cross-site writes and non-JSON bodies', async () => {
    const json = { 'content-type': 'application/json' };
    expect((await call(req('POST', { ...json, 'sec-fetch-site': 'cross-site' }, '{"a":1}'))).status).toBe(403);
    expect((await call(req('POST', { ...json, origin: 'https://evil.example' }, '{"a":1}'))).status).toBe(403);
    expect((await call(req('POST', { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' }, '{"a":1}'))).status).toBe(415);
    expect((await call(req('POST', { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' }, 'a=1'))).status).toBe(415);
    expect((await call(req('POST', { ...json, 'sec-fetch-site': 'same-origin' }, 'x'.repeat(300_000)))).status).toBe(413);
    const ok = await call(req('POST', { ...json, 'sec-fetch-site': 'same-origin' }, '{"a":1}'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ got: { a: 1 } });
    expect(ok.headers.get('cache-control')).toContain('no-store');
  });
});

describe('spend holds', () => {
  it('never lets parallel calls overshoot the budget', async () => {
    tempRepo();
    process.env.MONTHLY_BUDGET_USD = '1';
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => reserveSpend('test', 'm', 0.6, `job ${i}`)));
    const held = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<(usd: number) => Promise<void>>[];
    expect(held.length).toBeLessThanOrEqual(1);
    for (const r of results) if (r.status === 'rejected') expect((r.reason as HttpError).status).toBe(402);
    expect(await spentThisMonth()).toBeLessThanOrEqual(1);
    // Settling records the real cost in place of the hold.
    if (held[0]) await held[0].value(0.25);
    expect(await spentThisMonth()).toBe(held[0] ? 0.25 : 0);
  });

  it('refuses a Claude call before sending it once the budget is gone', async () => {
    tempRepo();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
    process.env.MONTHLY_BUDGET_USD = '0';
    await expect(ask(z.object({ x: z.string() }), { system: 's', content: 'c', note: 'test' })).rejects.toMatchObject({ status: 402 });
    expect(await spentThisMonth()).toBe(0);
  });
});

describe('bad input', () => {
  let fonts: FontSet;
  beforeAll(async () => {
    fonts = await loadAllFonts();
  });

  it('refuses edits that would break a design', async () => {
    tempRepo();
    await ensureSeed();
    const state = await projectState(SEED_PROJECT_ID, USERS.erin);
    const id = state.options[0].id;
    for (const patch of [
      { layout: '__proto__' },
      { layout: 'constructor' },
      { copyOverride: '' },
      { copyOverride: ['a'] },
      { palette: 'nope' },
      { pairing: { x: 1 } },
      { emphasis: 'loud' },
      { shadow: 'yes' },
      { headlineScale: 'big' },
      {},
      null,
      'layout',
    ]) {
      await expect(editOption(USERS.erin, SEED_PROJECT_ID, id, patch), JSON.stringify(patch)).rejects.toMatchObject({ status: 400 });
    }
    const { option } = await editOption(USERS.erin, SEED_PROJECT_ID, id, { headlineScale: 99, artScale: -5, copyOverride: { headline: 'Hi', tagline: 7 } });
    expect(option.payload.headlineScale).toBe(1.6);
    expect(option.payload.artScale).toBe(0.6);
    expect(option.payload.copyOverride).toEqual({ headline: 'Hi', tagline: '', extra: '' });
    await expect(editOption(USERS.erin, SEED_PROJECT_ID, 7 as never, { layout: 'stack' })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a brief that would break the hub', async () => {
    tempRepo();
    await ensureSeed();
    await expect(updateBrief(SEED_PROJECT_ID, { vibes: 'x' as never })).rejects.toMatchObject({ status: 400 });
    await expect(updateBrief(SEED_PROJECT_ID, { copy: 'x' as never })).rejects.toMatchObject({ status: 400 });
    const p = await updateBrief(SEED_PROJECT_ID, { vibes: ['retro-poster', 'nope', 'retro-poster', 7] as never, occasions: 'trip' as never });
    expect(p.brief.vibes).toEqual(['retro-poster']);
    expect(Array.isArray(p.brief.occasions)).toBe(true);
  });

  it('still renders old records with odd values', () => {
    const ctx = { fonts, copy: { headline: 'Hello', tagline: 'there', extra: '' }, tone: 'light' as const, shirtHex: '#FFFFFF', assetHref: (k: string) => k };
    const odd = [
      { layout: '__proto__', copyOverride: '' },
      { layout: 'nope', copyOverride: { headline: 5 } },
      { layout: 'stack', headlineScale: 'big', artScale: 1e9, emphasis: 'loud', palette: 5, pairing: null },
    ];
    for (const o of odd) {
      const d = { pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sunset' }, ...o } as unknown as ShirtDesign;
      const svg = renderDesign(d, ctx);
      expect(svg, JSON.stringify(o)).toContain('<path');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('lays out a pathological headline quickly', () => {
    const ctx = { fonts, copy: { headline: 'a', tagline: '', extra: '' }, tone: 'light' as const, shirtHex: '#FFFFFF', assetHref: (k: string) => k };
    const words = Array.from({ length: 70 }, (_, i) => String.fromCharCode(97 + (i % 26))).join(' ');
    for (const layout of ['bigtype', 'stack', 'poster'] as const) {
      const d: ShirtDesign = { layout, pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'none' }, copyOverride: { headline: words, tagline: words, extra: words } };
      renderDesign(d, ctx);
      const t = performance.now();
      renderDesign(d, ctx);
      expect(performance.now() - t, layout).toBeLessThan(300);
    }
  });

  it('caps order lines', async () => {
    tempRepo();
    const p = preset('birthday');
    const project = await createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    const state = await projectState(project.id, USERS.joel);
    const base = { optionId: state.options[0].id, garment: 'tee' as const, color: 'white', preset: 'standard' };
    await expect(approve(USERS.joel, project.id, { ...base, sizes: Array.from({ length: 51 }, () => ({ who: 'x', size: 'M' as const, qty: 1 })) })).rejects.toMatchObject({ status: 400 });
    await expect(approve(USERS.joel, project.id, { ...base, sizes: 'lots' as never })).rejects.toMatchObject({ status: 400 });
    await expect(approve(USERS.joel, project.id, { ...base, sizes: [null, { qty: 2, size: 'XXXXL', who: 9 }] as never })).resolves.toMatchObject({
      snapshot: { sizes: [{ who: '', size: 'M', qty: 2 }] },
    });
  });
});

describe('who can change their mind', () => {
  it('only whoever has the final say can reopen, and only once approved', async () => {
    tempRepo();
    const p = preset('birthday');
    const project = await createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    await expect(reopen(USERS.joel, project.id)).rejects.toMatchObject({ status: 409 });
    const state = await projectState(project.id, USERS.joel);
    await approve(USERS.joel, project.id, { optionId: state.options[0].id, garment: 'tee', color: 'white', preset: 'standard', sizes: [{ who: 'Maya', size: 'M', qty: 1 }] });
    await expect(reopen(USERS.erin, project.id)).rejects.toThrow('Only Joel can reopen');
    await reopen(USERS.joel, project.id);
    expect((await projectState(project.id, USERS.joel)).project.status).toBe('exploring');
  });
});

describe('artwork and print guards', () => {
  it('strips risky colors, trailing content and oversized drawings', () => {
    const svg = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><path d="M0 0L1 1" fill="\\75 rl(x)"/><path d="M1 1" fill="rgb(1,2,3)" stroke="#123"/><rect x="1" y="1" width="2" height="2" transform="rotate(5 1 1)"/></svg><g><path d="M9 9"/></g></svg>',
    );
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M0 0L1 1"/><path d="M1 1" stroke="#123"/><rect x="1" y="1" width="2" height="2" transform="rotate(5 1 1)"/></svg>');
    expect(() => sanitizeSvg(`<svg>${' '.repeat(MAX_SVG_CHARS)}</svg>`)).toThrow(/too big/);
  });

  it('refuses to rasterise SVGs that point at outside files', async () => {
    const ok = 'data:image/png;base64,iVBORw0KGgo=';
    expect(() => assertEmbeddedOnly(`<svg><image href="${ok}"/><use href="#a"/></svg>`)).not.toThrow();
    for (const href of ['/etc/passwd', 'file:///etc/hosts', 'https://example.com/a.png', '../secret.png', 'data:text/html;base64,PGI+']) {
      expect(() => assertEmbeddedOnly(`<svg><image xlink:href='${href}'/></svg>`), href).toThrow(/outside file/);
    }
    await expect(renderPrintPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="/etc/hosts" width="10" height="10"/></svg>', 10)).rejects.toThrow(/outside file/);
  });

  it('only downloads fal results from fal', async () => {
    for (const url of ['http://v3.fal.media/x.png', 'https://evil.example/x.png', 'https://fal.media.evil.example/x.png', 'https://169.254.169.254/latest', 'file:///etc/passwd', 'not a url']) {
      await expect(download(url), url).rejects.toThrow(/fal\.ai/);
    }
    expect((await download('data:image/png;base64,aGk=')).toString()).toBe('hi');
    await expect(download('data:image/png,not-base64')).rejects.toThrow(/fal\.ai/);
    await expect(download(`data:image/png;base64,${'A'.repeat(56 * 1024 * 1024)}`)).rejects.toThrow(/too big/);
  });

  it('asks fal for images inline, so nothing waits at a public link', async () => {
    const dot = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const sent: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    const realKey = process.env.FAL_KEY;
    process.env.FAL_KEY = 'test-key';
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ images: [{ url: `data:image/png;base64,${dot.toString('base64')}` }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const art = await falProvider.generate({ prompt: 'a palm tree' } as never);
      expect(sent[0].sync_mode).toBe(true);
      expect((await sharp(art.data).metadata()).width).toBe(4);
    } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = realKey;
    }
  });

  it('sends a strict page CSP', () => {
    const prod = contentSecurityPolicy('abc123', { dev: false, https: true, supabaseUrl: 'https://proj.supabase.co/' });
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(prod).not.toContain('unsafe-eval');
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toMatch(/img-src [^;]*https:\/\/proj\.supabase\.co/);
    expect(prod).toContain('upgrade-insecure-requests');
    const dev = contentSecurityPolicy('n', { dev: true, https: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain('supabase');
    expect(contentSecurityPolicy('n', { dev: false, https: false, supabaseUrl: 'javascript:alert(1)' })).not.toContain('javascript');
  });
});

describe('cost guards', () => {
  it('never prices an image at nothing, and guesses from the quality when it isn’t set', () => {
    process.env.COST_PER_IMAGE_USD = '0';
    expect(config.costPerImageUsd).toBe(0.01);
    delete process.env.COST_PER_IMAGE_USD;
    expect(config.costPerImageUsd).toBe(0.06);
    process.env.IMAGE_QUALITY = 'high';
    expect(config.costPerImageUsd).toBe(0.25);
    process.env.COST_PER_IMAGE_USD = '0.3';
    expect(config.costPerImageUsd).toBe(0.3);
  });

  it('lets a project hold a thousand designs, and no more', async () => {
    const { repo } = tempRepo();
    await ensureSeed();
    const existing = await repo.listOptions(SEED_PROJECT_ID);
    const [one] = existing;
    await repo.saveOptions(Array.from({ length: MAX_DESIGNS - existing.length - 3 }, (_, i) => ({ ...one, id: `fill${i}` })));
    await expect(remix(USERS.joel, SEED_PROJECT_ID, null, 6)).rejects.toMatchObject({ status: 409 });
    expect(await remix(USERS.joel, SEED_PROJECT_ID, null, 3)).toHaveLength(3);
    expect((await repo.listOptions(SEED_PROJECT_ID)).length).toBe(MAX_DESIGNS);
  });
});
