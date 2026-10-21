// Households: Joel and Erin move in as the first household, and nobody outside
// a household sees any of it: not its projects, its log, its files or its
// printers. Every project route checks, and this file fails if one doesn't.
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn, tempRepo } from './helpers';
import { GET as asset } from '@/app/api/assets/[...key]/route';
import { preset } from '@/lib/design/occasions';
import type { User } from '@/lib/engine/types';
import type { Printer } from '@/lib/kinds/printers';
import { activityFor, record } from '@/lib/server/activity';
import { COOKIE, userForSession, USERS } from '@/lib/server/auth';
import { approve } from '@/lib/server/decisions';
import { archivedCount, projectSummaries } from '@/lib/server/overview';
import { directoryCounts, forgetDirectory, getHousehold, membersOf, renameHousehold, userByEmail, userById } from '@/lib/server/people';
import { listPrinters, removePrinter, updatePrinter } from '@/lib/server/printers';
import { createProject } from '@/lib/server/projects';
import type { LocalRepo } from '@/lib/server/repo/local';
import { SupabaseRepo } from '@/lib/server/repo/supabase';
import { canManage, householdOf, projectFor, projectState } from '@/lib/server/studio';

// The signed-in cookie, as the routes read it.
const jar = vi.hoisted(() => ({ value: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === 'studio_session' && jar.value ? { value: jar.value } : undefined) }) }));

const SITE = 'https://studio.example.com';
const ENV = [
  'ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'SIGN_IN_LINKS', 'VERCEL',
];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.ERIN_GOOGLE_EMAIL = 'Erin@Example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
  // Email codes on, so sessions are signed with the server's own secret.
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  jar.value = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const { joel, erin } = USERS;
const birthday = (by: User, title = 'Maya’s 40th') => {
  const p = preset('birthday');
  return createProject(by, { occasion: 'birthday', basics: { ...p.example, title }, copy: p.copyIdeas(p.example)[0] });
};
const order = { garment: 'tee' as const, color: 'navy', preset: 'standard', sizes: [{ who: 'Maya', size: 'M' as const, qty: 1 }] };

/** The Riveras next door: Sam owns the household, Ana is in it too. */
async function neighbours(repo: LocalRepo): Promise<{ sam: User; ana: User }> {
  await userById('joel'); // the first household moves in first
  const t = new Date().toISOString();
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: t, createdBy: 'sam' });
  await repo.savePerson({ id: 'sam', name: 'Sam', email: 'sam@example.com', createdAt: t });
  await repo.savePerson({ id: 'ana', name: 'Ana', email: 'ana@example.com', createdAt: t });
  await repo.saveMembership({ householdId: 'riveras', personId: 'sam', role: 'owner', joinedAt: t });
  await repo.saveMembership({ householdId: 'riveras', personId: 'ana', role: 'member', joinedAt: t });
  forgetDirectory();
  return { sam: (await userById('sam'))!, ana: (await userById('ana'))! };
}

const signIn = async (id: string) => {
  jar.value = await signedIn(id);
};
type Handler = (req: Request, ctx: { params: Promise<object> }) => Promise<Response>;
/** Calls a route handler as the browser would, signed in as whoever `signIn` last named. */
const call = (handler: unknown, method: string, url: string, params: object, body?: object) =>
  (handler as Handler)(
    new Request(`${SITE}${url}`, {
      method,
      headers: { 'sec-fetch-site': 'same-origin', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { params: Promise.resolve(params) },
  );

describe('moving in', () => {
  it('adds Joel and Erin as the first household the first time, and only once', async () => {
    const { repo } = tempRepo();
    expect(await userByEmail(' Joel@EXAMPLE.com ')).toEqual(joel);
    expect(await userByEmail('erin@example.com')).toEqual(erin);
    const stored = (await repo.loadDirectory())!;
    expect(stored.people.map((p) => p.id).sort()).toEqual(['erin', 'joel']);
    expect(stored.people.find((p) => p.id === 'joel')).toMatchObject({ email: 'joel@example.com', siteAdmin: true });
    expect(stored.households).toEqual([expect.objectContaining({ id: 'first', name: 'Joel & Erin', createdBy: 'joel' })]);
    expect(stored.memberships.map((m) => `${m.personId}:${m.role}`).sort()).toEqual(['erin:member', 'joel:owner']);
    expect(await directoryCounts()).toEqual({ households: 1, people: 2 });

    forgetDirectory();
    await userById('joel');
    expect((await repo.loadDirectory())!.people).toHaveLength(2);

    // A new address for Erin in Vercel moves her sign-in with it.
    process.env.ERIN_GOOGLE_EMAIL = 'erin.new@example.com';
    forgetDirectory();
    expect(await userByEmail('erin.new@example.com')).toEqual(erin);
    expect(await userByEmail('erin@example.com')).toBeNull();
    expect(await userByEmail('someone.else@example.com')).toBeNull();
  });

  it('works from the two variables, as before, until the setup file is run', async () => {
    const { repo } = tempRepo();
    vi.spyOn(repo, 'loadDirectory').mockImplementation(async () => null as never);
    expect(await userByEmail('erin@example.com')).toEqual(erin);
    expect(await userById('joel')).toEqual(joel);
    expect(await directoryCounts()).toBeNull();
    expect((await membersOf('first')).map((m) => m.name)).toEqual(['Joel', 'Erin']);
    await expect(renameHousehold(joel, 'The Hs')).rejects.toMatchObject({ status: 503 });
  });

  it('keeps everything from before households in the first one', async () => {
    const { repo } = tempRepo();
    const project = await birthday(joel);
    const { householdId, ...old } = project;
    expect(householdId).toBe('first');
    await repo.saveProject(old);
    expect(householdOf(old as { householdId?: string })).toBe('first');
    expect((await projectFor(erin, project.id)).id).toBe(project.id);
    expect((await projectSummaries(erin)).map((s) => s.project.id)).toContain(project.id);
  });
});

describe('another household', () => {
  it('sees none of the first household’s projects or log, and the first sees none of theirs', async () => {
    const { repo } = tempRepo();
    const ours = await birthday(joel);
    await record(joel, 'signed-in', { detail: 'with Google' });
    const { sam, ana } = await neighbours(repo);
    expect(sam).toMatchObject({ household: 'riveras', role: 'owner', admin: false, households: ['riveras'] });
    expect(ana).toMatchObject({ household: 'riveras', role: 'member' });

    await expect(projectFor(sam, ours.id)).rejects.toMatchObject({ status: 404 });
    await expect(projectState(ours.id, sam)).rejects.toMatchObject({ status: 404 });
    expect(await projectSummaries(sam)).toEqual([]);
    expect(await archivedCount(sam)).toBe(0);

    const theirs = await birthday(sam, 'Abuela’s 80th');
    expect(theirs.householdId).toBe('riveras');
    await record(sam, 'signed-in', { detail: 'with an email code' });
    expect((await projectSummaries(ana)).map((s) => s.project.title)).toEqual(['Abuela’s 80th']);
    expect((await projectSummaries(joel)).map((s) => s.project.id)).not.toContain(theirs.id);
    await expect(projectFor(erin, theirs.id)).rejects.toMatchObject({ status: 404 });
    expect((await projectState(theirs.id, ana)).members.map((m) => m.name)).toEqual(['Sam', 'Ana']);

    const theirLog = (await activityFor(sam)).entries;
    expect(theirLog.length).toBeGreaterThan(0);
    expect(theirLog.every((e) => e.householdId === 'riveras')).toBe(true);
    expect((await activityFor(joel)).entries.some((e) => e.by === 'sam' || e.projectId === theirs.id)).toBe(false);
    // Asking for the other household's project history gets nothing either.
    expect((await activityFor(sam, { projectId: ours.id })).entries).toEqual([]);
  });

  it('get 404 from every project route, and the project is untouched', async () => {
    const { repo } = tempRepo();
    const ours = await birthday(joel);
    const [option] = (await projectState(ours.id, joel)).options;
    await neighbours(repo);
    await signIn('sam');
    const routes: [string, string, object?][] = [
      ['', 'GET'],
      ['', 'PATCH', { vibes: [] }],
      ['react', 'POST', { optionId: option.id, value: 'love' }],
      ['remix', 'POST', {}],
      ['approve', 'POST', { ...order, optionId: option.id }],
      ['archive', 'POST'],
      ['rename', 'POST', { title: 'Mine now' }],
      ['delete', 'POST', { confirm: ours.title }],
      ['printers', 'GET'],
      ['share', 'POST', { printerId: null }],
    ];
    const modules: Record<string, () => Promise<unknown>> = {
      '': () => import('@/app/api/projects/[id]/route'),
      react: () => import('@/app/api/projects/[id]/react/route'),
      remix: () => import('@/app/api/projects/[id]/remix/route'),
      approve: () => import('@/app/api/projects/[id]/approve/route'),
      archive: () => import('@/app/api/projects/[id]/archive/route'),
      rename: () => import('@/app/api/projects/[id]/rename/route'),
      delete: () => import('@/app/api/projects/[id]/delete/route'),
      printers: () => import('@/app/api/projects/[id]/printers/route'),
      share: () => import('@/app/api/projects/[id]/share/route'),
    };
    for (const [sub, method, body] of routes) {
      const mod = (await modules[sub]()) as Record<string, Handler>;
      const res = await call(mod[method], method, `/api/projects/${ours.id}/${sub}`, { id: ours.id }, body);
      expect(res.status, `${method} ${sub || '(project)'}`).toBe(404);
    }
    expect(await repo.getProject(ours.id)).toEqual(ours);
    expect(await repo.listReactions(ours.id)).toEqual([]);
    // Joel still gets in.
    await signIn('joel');
    const mod = await import('@/app/api/projects/[id]/route');
    expect((await call(mod.GET, 'GET', `/api/projects/${ours.id}`, { id: ours.id })).status).toBe(200);
  });

  it('can’t open another household’s artwork or print files, even knowing where they are', async () => {
    const { repo } = tempRepo();
    const ours = await birthday(joel);
    const [option] = (await projectState(ours.id, joel)).options;
    const decision = await approve(joel, ours.id, { ...order, optionId: option.id });
    await neighbours(repo);
    const png = Buffer.from('not really a png');
    for (const key of ['art/old.png', 'art/first/new.png', `decisions/${decision.id}/order.txt`, 'art/riveras/theirs.png', 'backups/latest.json']) {
      await repo.putAsset(key, png);
    }
    const open = async (who: string, key: string) => {
      await signIn(who);
      return (await call(asset, 'GET', `/api/assets/${key}`, { key: key.split('/') })).status;
    };
    for (const key of ['art/old.png', 'art/first/new.png', `decisions/${decision.id}/order.txt`]) {
      expect(await open('erin', key), key).toBe(200);
      expect(await open('sam', key), key).toBe(404);
    }
    expect(await open('ana', 'art/riveras/theirs.png')).toBe(200);
    expect(await open('joel', 'art/riveras/theirs.png')).toBe(404);
    expect(await open('joel', 'backups/latest.json')).toBe(404);
  });

  it('keep their own printer list', async () => {
    const { repo } = tempRepo();
    await neighbours(repo);
    const base: Omit<Printer, 'id' | 'name'> = { kind: 'local', website: null, phone: null, email: null, address: null, area: null, methods: [], ownShirts: 'unknown', minimum: null, turnaround: null, pricing: null, fileRequirements: null, howToSend: null, notes: null, sources: [], checkedAt: '2026-10-20T00:00:00.000Z', searches: { '90210': '2026-10-20T00:00:00.000Z' }, status: 'found' };
    await repo.savePrinters([
      { ...base, id: 'p-ink-co', name: 'Ink Co', note: 'Joel’s note' },
      { ...base, id: 'riveras-p-ink-co', name: 'Ink Co', householdId: 'riveras' },
    ]);
    expect((await listPrinters('first')).map((p) => p.id)).toEqual(['p-ink-co']);
    expect((await listPrinters('riveras')).map((p) => p.id)).toEqual(['riveras-p-ink-co']);
    await expect(updatePrinter('riveras', 'p-ink-co', { status: 'saved' })).rejects.toMatchObject({ status: 404 });
    await expect(removePrinter('riveras', 'p-ink-co')).rejects.toMatchObject({ status: 404 });
    expect((await listPrinters('first'))[0]).toMatchObject({ status: 'found', note: 'Joel’s note' });
  });
});

describe('the household’s owner', () => {
  it('renames it; a member can’t', async () => {
    tempRepo();
    await expect(renameHousehold(erin, 'Ours')).rejects.toMatchObject({ status: 403 });
    expect((await renameHousehold(joel, '  The   Home   Team  ')).name).toBe('The Home Team');
    expect((await getHousehold('first'))?.name).toBe('The Home Team');
    await expect(renameHousehold(joel, '   ')).rejects.toMatchObject({ status: 400 });
  });

  it('manages any of the household’s projects; a member only their own; another owner none', async () => {
    const { repo } = tempRepo();
    const hers = await birthday(erin, 'Erin’s idea');
    const his = await birthday(joel, 'Joel’s idea');
    const { sam } = await neighbours(repo);
    expect(canManage(joel, hers)).toBe(true);
    expect(canManage(erin, hers)).toBe(true);
    expect(canManage(erin, his)).toBe(false);
    expect(canManage(sam, hers)).toBe(false);
  });
});

describe('sessions', () => {
  it('can name anyone, and stop working once they belong to no household', async () => {
    const { repo } = tempRepo();
    await neighbours(repo);
    const cookie = { name: COOKIE, value: await signedIn('sam') };
    expect(cookie.name).toBe(COOKIE);
    expect(await userForSession(cookie.value)).toMatchObject({ id: 'sam', household: 'riveras' });
    const { memberships } = (await repo.loadDirectory())!;
    await repo.importAll({ memberships: memberships.filter((m) => m.personId !== 'sam') });
    forgetDirectory();
    expect(await userForSession(cookie.value)).toBeNull();
  });
});

describe('every project route', () => {
  it('starts with requireMember', () => {
    const root = path.join(process.cwd(), 'src/app/api/projects/[id]');
    const files = fs.readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('route.ts'));
    expect(files.length).toBeGreaterThan(15);
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      const handlers = src.match(/export const (GET|POST|PATCH|PUT|DELETE)\b/g) ?? [];
      const checks = src.match(/await requireMember\(id\)/g) ?? [];
      expect(checks.length, f).toBe(handlers.length);
      expect(src, f).not.toMatch(/requireUser/);
    }
  });
});

describe('Supabase: people and households', () => {
  let server: http.Server;
  let base = '';
  let setUp = true;
  const calls: { method: string; url: string; body: string }[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const url = decodeURIComponent(req.url ?? '');
        calls.push({ method: req.method ?? '', url, body });
        res.setHeader('Content-Type', 'application/json');
        const table = url.match(/^\/rest\/v1\/(\w+)/)?.[1];
        if (!setUp && ['people', 'households', 'memberships'].includes(table ?? '')) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }));
        }
        if (req.method === 'GET' && table === 'people') return res.end(JSON.stringify([{ data: { id: 'joel', name: 'Joel', email: 'joel@example.com', createdAt: 't' } }]));
        res.end('[]');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('reads all three tables, and says so when the setup file hasn’t been run', async () => {
    setUp = true;
    const repo = new SupabaseRepo(base, 'sb_secret_test');
    expect(await repo.loadDirectory()).toEqual({ people: [{ id: 'joel', name: 'Joel', email: 'joel@example.com', createdAt: 't' }], households: [], memberships: [] });
    setUp = false;
    expect(await repo.loadDirectory()).toBeNull();
    const check = await repo.check();
    expect(check.ok).toBe(false);
    expect(check.message).toContain('0006_households.sql');
  });

  it('keeps the address in its own column, so one address is one person', async () => {
    setUp = true;
    const repo = new SupabaseRepo(base, 'sb_secret_test');
    await repo.savePerson({ id: 'sam', name: 'Sam', email: 'sam@example.com', createdAt: '2026-10-20T00:00:00.000Z' });
    expect(JSON.parse(calls.at(-1)!.body)).toMatchObject({ id: 'sam', email: 'sam@example.com', data: { name: 'Sam' } });
    await repo.saveMembership({ householdId: 'riveras', personId: 'sam', role: 'owner', joinedAt: '2026-10-20T00:00:00.000Z' });
    expect(JSON.parse(calls.at(-1)!.body)).toMatchObject({ household_id: 'riveras', person_id: 'sam', data: { role: 'owner' } });
  });

  it('asks the log for one household only (0006 marks the older entries as the first household’s)', async () => {
    const repo = new SupabaseRepo(base, 'sb_secret_test');
    await repo.listActivity({ household: 'riveras', limit: 10 });
    expect(calls.at(-1)!.url).toContain('data->>householdId=eq.riveras');
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/0006_households.sql'), 'utf8');
    expect(sql).toContain(`update activity set data = jsonb_set(data, '{householdId}', '"first"') where data->>'householdId' is null;`);
  });
});
