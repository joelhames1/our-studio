// Supabase setup mistakes come back as plain-English advice, not a crashed
// page. Runs the real Supabase client against a stand-in server that answers
// the way Supabase does for each mistake.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getRepo, setRepo, SetupNeeded } from '@/lib/server/repo';
import { supabaseConfigProblem, SupabaseRepo } from '@/lib/server/repo/supabase';

type Mode = 'ok' | 'missing' | 'denied' | 'badkey' | 'noprinters';
let mode: Mode = 'ok';
const paths: string[] = [];
let server: http.Server;
let base = '';

const REPLIES: Record<Exclude<Mode, 'ok' | 'noprinters'>, [number, object]> = {
  missing: [404, { code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public.projects' in the schema cache" }],
  denied: [403, { code: '42501', details: null, hint: null, message: 'permission denied for table projects' }],
  badkey: [401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' }],
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    paths.push(req.url ?? '');
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'ok' || (mode === 'noprinters' && !req.url?.startsWith('/rest/v1/printers'))) return res.end('[]');
    const [status, body] = REPLIES[mode === 'noprinters' ? 'missing' : mode];
    res.statusCode = status;
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;

describe('Supabase setup problems', () => {
  it('turns each kind of setup mistake into advice', async () => {
    // A pasted ".../rest/v1/" still works.
    const repo = new SupabaseRepo(`${base}/rest/v1/`, 'sb_secret_test');
    mode = 'ok';
    await expect(repo.listProjects()).resolves.toEqual([]);
    expect(paths.at(-1)).toMatch(/^\/rest\/v1\/projects\?/);

    const cases: [Mode, RegExp][] = [
      ['missing', /tables aren’t there yet/],
      ['denied', /refused access.*0003_server_access\.sql/],
      ['badkey', /didn’t accept the key/],
    ];
    for (const [m, advice] of cases) {
      mode = m;
      const err = await repo.listProjects().catch((e) => e);
      expect(err, m).toBeInstanceOf(SetupNeeded);
      expect(err.message, m).toMatch(advice);
      await expect(repo.saveProject({ id: 'x' } as never), m).rejects.toBeInstanceOf(SetupNeeded);
      expect((await repo.check()).message, m).toMatch(advice);
    }
  });

  it('names the setup file that was skipped', async () => {
    const repo = new SupabaseRepo(base, 'sb_secret_test');
    mode = 'noprinters';
    const check = await repo.check();
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/printers table isn’t there yet.*0004_printers\.sql/);
  });

  it('says so when Supabase can’t be reached', async () => {
    const repo = new SupabaseRepo('http://127.0.0.1:9', 'sb_secret_test');
    const err = await repo.listProjects().catch((e) => e);
    expect(err).toBeInstanceOf(SetupNeeded);
    expect(err.message).toMatch(/Couldn’t reach Supabase at 127\.0\.0\.1:9/);
  });

  it('catches the usual copy-and-paste mix-ups before sending anything', () => {
    const ok = 'https://abcdefgh.supabase.co';
    expect(supabaseConfigProblem(ok, 'sb_secret_abc')).toBeNull();
    expect(supabaseConfigProblem(ok, jwt('service_role'))).toBeNull();
    expect(supabaseConfigProblem(ok, 'sb_publishable_abc')).toMatch(/publishable key/);
    expect(supabaseConfigProblem(ok, jwt('anon'))).toMatch(/anon key/);
    expect(supabaseConfigProblem('https://supabase.com/dashboard/project/abcdefgh', 'sb_secret_abc')).toMatch(/dashboard address/);
    expect(supabaseConfigProblem('abcdefgh.supabase.co', 'sb_secret_abc')).toMatch(/isn’t a web address/);
    expect(supabaseConfigProblem('http://abcdefgh.supabase.co', 'sb_secret_abc')).toMatch(/https/);
  });
});

describe('getRepo', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  afterEach(() => {
    setRepo(null);
    process.env.SUPABASE_URL = saved.url ?? '';
    process.env.SUPABASE_SECRET_KEY = saved.key ?? '';
  });

  it('refuses a publishable key with setup advice instead of a crash', () => {
    setRepo(null);
    process.env.SUPABASE_URL = 'https://abcdefgh.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_publishable_abc';
    expect(() => getRepo()).toThrow(SetupNeeded);
    expect(() => getRepo()).toThrow(/publishable key/);
  });
});
