// The activity log (who did what, and when) and the per-person rate limits on
// requests that cost money or a lot of server time.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { preset } from '@/lib/design/occasions';
import type { ActivityEntry } from '@/lib/engine/types';
import { activityFor, record } from '@/lib/server/activity';
import { archiveProject, deleteProject, renameProject, restoreProject, setDesignArchived } from '@/lib/server/archive';
import { HttpError, USERS } from '@/lib/server/auth';
import { approve, reopen } from '@/lib/server/decisions';
import { LIMITS, rateLimit } from '@/lib/server/limits';
import { createProject } from '@/lib/server/projects';
import { setRepo, SetupNeeded } from '@/lib/server/repo';
import { SupabaseRepo } from '@/lib/server/repo/supabase';
import { projectState } from '@/lib/server/studio';

const { joel, erin } = USERS;
const order = { garment: 'tee' as const, color: 'navy', preset: 'standard', sizes: [{ who: 'Maya', size: 'M' as const, qty: 3 }] };

async function birthday(by = joel, title = 'Maya’s 40th') {
  const p = preset('birthday');
  return createProject(by, { occasion: 'birthday', basics: { ...p.example, title }, copy: p.copyIdeas(p.example)[0] });
}

const brief = (e: ActivityEntry) => [e.by, e.action, e.projectTitle ?? '', e.detail ?? ''].join(' | ');

describe('activity log', () => {
  it('records each step of a project’s life, and keeps the record after it’s deleted', async () => {
    tempRepo();
    const project = await birthday(erin);
    const state = await projectState(project.id, erin);
    await approve(erin, project.id, { ...order, optionId: state.options[0].id });
    await reopen(erin, project.id);
    await setDesignArchived(joel, project.id, state.options[1].id, true);
    await setDesignArchived(joel, project.id, state.options[1].id, true); // already archived: no second entry
    await setDesignArchived(joel, project.id, state.options[1].id, false);
    await renameProject(joel, project.id, 'Maya turns 40');
    await renameProject(joel, project.id, 'Maya turns 40'); // same name: nothing to record
    await archiveProject(erin, project.id);
    await restoreProject(erin, project.id);
    await archiveProject(erin, project.id);
    await deleteProject(erin, project.id, 'maya turns 40');

    const { entries, missing, next } = await activityFor(joel, { projectId: project.id });
    expect(missing).toBe(false);
    expect(next).toBeNull();
    const lines = entries.map(brief).reverse();
    expect(lines.pop()).toMatch(/^erin \| deleted \| Maya turns 40 \| \d+ designs$/);
    expect(lines).toEqual([
      'erin | project-created | Maya’s 40th | ',
      'erin | approved | Maya’s 40th | 3 shirts',
      'erin | reopened | Maya’s 40th | ',
      'joel | design-archived | Maya’s 40th | a front',
      'joel | design-restored | Maya’s 40th | a front',
      'joel | renamed | Maya turns 40 | from “Maya’s 40th”',
      'erin | archived | Maya turns 40 | ',
      'erin | restored | Maya turns 40 | ',
      'erin | archived | Maya turns 40 | ',
    ]);
    expect(entries.find((e) => e.action === 'design-archived')!.optionId).toBe(state.options[1].id);
    // Newest first.
    const times = entries.map((e) => e.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('shows sign-ins only to the person and the admin, and pages back through older entries', async () => {
    tempRepo();
    await record(erin, 'signed-in', { detail: 'with Google' });
    await record(joel, 'signed-in', { detail: 'with Google' });
    const nonAdminErin = { ...erin, admin: false };
    expect((await activityFor(nonAdminErin)).entries.map((e) => e.by)).toEqual(['erin']);
    expect((await activityFor(joel)).entries.map((e) => e.by).sort()).toEqual(['erin', 'joel']);

    for (let i = 0; i < 5; i++) {
      await record(joel, 'archived', { project: { id: `p${i}`, title: `Project ${i}` } });
      await new Promise((r) => setTimeout(r, 2));
    }
    const first = await activityFor(joel, { limit: 3 });
    expect(first.entries.map((e) => e.projectTitle)).toEqual(['Project 4', 'Project 3', 'Project 2']);
    const second = await activityFor(joel, { limit: 3, before: first.next! });
    expect(second.entries.map((e) => e.projectTitle ?? e.action)).toEqual(['Project 1', 'Project 0', 'signed-in']);
  });

  it('never gets in the way of the action, and says when its table isn’t set up', async () => {
    const { repo } = tempRepo();
    const broken = Object.create(repo, {
      addActivity: { value: async () => { throw new Error('disk full'); } },
      listActivity: { value: async () => { throw new SetupNeeded('Supabase is connected, but the activity table isn’t there yet.'); } },
    });
    setRepo(broken);
    const project = await birthday();
    expect(project.title).toBe('Maya’s 40th');
    expect(await activityFor(joel)).toEqual({ entries: [], next: null, missing: true });
  });
});

/** Midnight UTC tomorrow: windows there haven't ended yet, so nothing clears them mid-test whatever the time now. */
const tomorrow = () => (Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000;

describe('rate limits', () => {
  it('lets people work, then slows a burst down with a time to come back', async () => {
    tempRepo();
    const now = tomorrow() + 10 * 3600_000 + 2 * 60_000; // 10:02, 2 minutes into a 10-minute window
    const [, max] = LIMITS.art.windows[0];
    for (let i = 0; i < max; i++) await rateLimit(erin, 'art', now);
    const err = await rateLimit(erin, 'art', now).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.message).toBe('That’s a lot of new artwork in a short while. Try again in about 8 minutes.');
    // Someone else, and another kind of request, aren't affected.
    await expect(rateLimit(joel, 'art', now)).resolves.toBeUndefined();
    await expect(rateLimit(erin, 'claude', now)).resolves.toBeUndefined();
    // The next window starts fresh.
    await expect(rateLimit(erin, 'art', now + 10 * 60_000)).resolves.toBeUndefined();
    // Hitting the limit is logged once per window, not once per retry.
    await rateLimit(erin, 'art', now).catch(() => {});
    const limited = (await activityFor(joel)).entries.filter((e) => e.action === 'limited');
    expect(limited.map(brief)).toEqual(['erin | limited |  | new artwork: 6 per 10 minutes']);
  });

  it('has a daily ceiling as well as a burst limit', async () => {
    tempRepo();
    const start = tomorrow();
    const [, perDay] = LIMITS.search.windows[1];
    for (let i = 0; i < perDay; i++) await rateLimit(joel, 'search', start + i * 3600_000);
    const err = await rateLimit(joel, 'search', start + perDay * 3600_000).catch((e) => e);
    expect(err.message).toMatch(/printer searches.*Try again in about 14 hours/);
  });

  it('lets everything through when the counters aren’t set up or can’t be reached', async () => {
    const { repo } = tempRepo();
    setRepo(Object.create(repo, { hit: { value: async () => null } }));
    for (let i = 0; i < 20; i++) await rateLimit(erin, 'art');
    setRepo(Object.create(repo, { hit: { value: async () => { throw new Error('connection reset'); } } }));
    for (let i = 0; i < 20; i++) await rateLimit(erin, 'art');
  });
});

describe('Supabase: activity and limits', () => {
  let server: http.Server;
  let base = '';
  let setUp = true;
  const calls: { url: string; body: string }[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        calls.push({ url: req.url ?? '', body });
        res.setHeader('Content-Type', 'application/json');
        const later = req.url?.startsWith('/rest/v1/rpc/rate_hit') || req.url?.startsWith('/rest/v1/activity') || req.url?.startsWith('/rest/v1/rate_limits');
        if (later && !setUp) {
          res.statusCode = 404;
          return res.end(JSON.stringify(req.url?.includes('/rpc/') ? { code: 'PGRST202', message: 'Could not find the function public.rate_hit' } : { code: 'PGRST205', message: 'Could not find the table' }));
        }
        if (req.url?.startsWith('/rest/v1/rpc/rate_hit')) return res.end('3');
        res.end('[]');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('counts through one database call, and asks for the setup file when it’s missing', async () => {
    setUp = true;
    const repo = new SupabaseRepo(base, 'sb_secret_test');
    expect(await repo.hit('erin|art|600|0', new Date(600_000))).toBe(3);
    expect(JSON.parse(calls.at(-1)!.body)).toEqual({ p_key: 'erin|art|600|0', p_expires: new Date(600_000).toISOString() });
    expect((await repo.check()).ok).toBe(true);

    setUp = false;
    const fresh = new SupabaseRepo(base, 'sb_secret_test');
    expect(await fresh.hit('erin|art|600|0', new Date(600_000))).toBeNull();
    const n = calls.length;
    expect(await fresh.hit('erin|art|600|0', new Date(600_000))).toBeNull();
    expect(calls.length).toBe(n); // doesn't keep asking for a while
    const check = await fresh.check();
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/activity table isn’t there yet.*0005_activity_and_limits\.sql/);
  });

  it('backs up every table but the rate counters and signed-in browsers, and skips one that isn’t set up yet', async () => {
    setUp = false;
    const n = calls.length;
    const tables = await new SupabaseRepo(base, 'sb_secret_test').exportAll();
    expect(Object.keys(tables)).toEqual(['projects', 'options', 'reactions', 'decisions', 'spend', 'printers', 'activity', 'people', 'households', 'memberships', 'invites']);
    expect(tables.activity).toEqual([]);
    const asked = calls.slice(n).map((c) => decodeURIComponent(c.url));
    expect(asked.some((u) => u.startsWith('/rest/v1/rate_limits'))).toBe(false);
    expect(asked.find((u) => u.startsWith('/rest/v1/projects'))).toMatch(/select=\*/);
  });

  it('narrows the log to one person’s entries of one kind inside the database', async () => {
    setUp = true;
    await new SupabaseRepo(base, 'sb_secret_test').listActivity({ by: 'erin', action: 'agreed', limit: 20 });
    const url = decodeURIComponent(calls.at(-1)!.url);
    expect(url).toMatch(/^\/rest\/v1\/activity\?/);
    expect(url).toContain('data->>by=eq.erin');
    expect(url).toContain('data->>action=eq.agreed');
    expect(url).toContain('limit=20');
  });
});
