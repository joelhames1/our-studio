// The nightly backup (a month of copies, one per night, and a way back) and the
// alert emails when something breaks (through Resend, one an hour for each
// problem and a few at most for each kind).
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempRepo } from './helpers';
import { GET as cron } from '@/app/api/cron/backup/route';
import { preset } from '@/lib/design/occasions';
import { sendAlert, sendTestAlert } from '@/lib/server/alerts';
import { api } from '@/lib/server/api';
import { USERS } from '@/lib/server/auth';
import { backUp, lastBackup, restore, type BackupFile } from '@/lib/server/backup';
import { backupTrouble } from '@/lib/server/health';
import { rateLimit } from '@/lib/server/limits';
import { createProject } from '@/lib/server/projects';
import { DatabaseUnreachable, getRepo, SetupNeeded } from '@/lib/server/repo';

const ENV = ['RESEND_API_KEY', 'ALERT_EMAIL', 'ALERT_FROM', 'CONTACT_EMAIL', 'CRON_SECRET'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const SECRET = 'c'.repeat(16) + '0123456789abcdef0123456789';
const HOUR = 3_600_000;

// Resend, stood in for: every email it's asked to send, and what it says back.
let emails: { from: string; to: string[]; subject: string; text: string }[] = [];
let resendSays: { status: number; body: object } = { status: 200, body: { id: 'email_1' } };

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  emails = [];
  resendSays = { status: 200, body: { id: 'email_1' } };
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== 'https://api.resend.com/emails') return realFetch(input, init);
    emails.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(resendSays.body), { status: resendSays.status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const birthday = () => {
  const p = preset('birthday');
  return createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
};
const alertsOn = () => {
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.ALERT_EMAIL = 'Joel@Example.com';
};

describe('nightly backup', () => {
  it('copies every table into the night’s file, and puts a deleted project back', async () => {
    const { repo } = tempRepo();
    const project = await birthday();
    const summary = await backUp(new Date('2026-10-19T10:17:00Z'));
    expect(summary.file).toBe('backups/2026-10-19.json');
    expect(summary.rows.projects).toBeGreaterThanOrEqual(1);
    expect(summary.rows.options).toBeGreaterThan(0);
    expect(await lastBackup()).toEqual(summary);

    const file = JSON.parse((await repo.getAsset('backups/2026-10-19.json'))!.data.toString('utf8')) as BackupFile;
    expect(file).toMatchObject({ kind: 'local', at: '2026-10-19T10:17:00.000Z' });

    await repo.deleteProject(project.id);
    expect(await repo.getProject(project.id)).toBeNull();
    await restore(file);
    expect((await repo.getProject(project.id))?.title).toBe(project.title);
    await expect(restore({ ...file, kind: 'supabase' })).rejects.toThrow(/came from supabase storage/);
  });

  it('keeps a month: each night’s copy is named by its date, and older ones go', async () => {
    const { repo } = tempRepo();
    const old = async (file: string) => repo.putAsset(file, Buffer.from('{}'));
    const there = async (file: string) => (await repo.getAsset(file)) !== null;
    // From before copies were dated: each goes when its day comes round.
    await old('backups/day-21.json');
    await old('backups/day-22.json');
    await old('backups/day-31.json');
    expect((await backUp(new Date('2026-10-21T10:17:00Z'))).file).toBe('backups/2026-10-21.json');
    expect(await there('backups/day-21.json')).toBe(false);
    expect(await there('backups/day-22.json')).toBe(true);
    await backUp(new Date('2026-11-20T10:17:00Z'));
    expect(await there('backups/2026-10-21.json')).toBe(true); // 30 nights on: still kept
    await backUp(new Date('2026-11-21T10:17:00Z'));
    expect(await there('backups/2026-10-21.json')).toBe(false);
    expect(await there('backups/2026-11-20.json')).toBe(true);
    // November has no 31st, so its last day clears that one too.
    expect(await there('backups/day-31.json')).toBe(true);
    await backUp(new Date('2026-11-30T10:17:00Z'));
    expect(await there('backups/day-31.json')).toBe(false);
    expect((await lastBackup())?.at).toBe('2026-11-30T10:17:00.000Z');
  });

  it('warns when the schedule has stopped, since a run that never starts can’t send an alert', async () => {
    tempRepo();
    const now = Date.now();
    await backUp(new Date(now - 30 * HOUR));
    // Off until scheduled: Setup says so already.
    expect(await backupTrouble(now)).toBeNull();
    process.env.CRON_SECRET = SECRET;
    expect(await backupTrouble(now)).toBeNull();
    expect(await backupTrouble(now + 10 * HOUR)).toMatchObject({ label: 'The nightly backup', message: 'The last copy of the database was saved 2 days ago.' });
  });

  it('only starts for Vercel’s schedule, and emails when it fails', async () => {
    const { repo } = tempRepo();
    const run = (auth?: string) => cron(new Request('https://studio.example.com/api/cron/backup', { headers: auth ? { authorization: auth } : {} }));
    expect((await run(`Bearer ${SECRET}`)).status).toBe(401); // no CRON_SECRET: off, and no different from a wrong one
    process.env.CRON_SECRET = SECRET;
    expect((await run()).status).toBe(401);
    expect((await run('Bearer not-the-secret')).status).toBe(401);
    const ok = await run(`Bearer ${SECRET}`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { file: string }).file).toMatch(/^backups\/\d{4}-\d\d-\d\d\.json$/);

    alertsOn();
    vi.spyOn(repo, 'exportAll').mockRejectedValueOnce(new Error('storage is full'));
    expect((await run(`Bearer ${SECRET}`)).status).toBe(500);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe('Our Studio: last night’s backup didn’t work');
    expect(emails[0].text).toContain('storage is full');
  });
});

describe('alert emails', () => {
  it('stay off until Resend and an address are set', async () => {
    tempRepo();
    expect(await sendAlert('server', ['Something broke'])).toBe(false);
    process.env.RESEND_API_KEY = 're_test_not_real';
    expect(await sendAlert('server', ['Something broke'])).toBe(false); // nowhere to send it
    expect(emails).toEqual([]);
  });

  it('send one email an hour for each problem, and a few at most for each kind', async () => {
    tempRepo();
    alertsOn();
    // A minute into the current hour (the laptop's counters tidy up against the real clock).
    const now = Math.floor(Date.now() / HOUR) * HOUR + 60_000;
    expect(await sendAlert('server', ['A request failed (POST /api/x).'], now)).toBe(true);
    // The same problem again, give or take a number: once is enough.
    expect(await sendAlert('server', ['A request failed (POST /api/x).'], now + 60_000)).toBe(false);
    expect(await sendAlert('server', ['A request failed (POST /api/x).', 'Took 12 ms'], now + 60_000)).toBe(true);
    expect(await sendAlert('server', ['A request failed (POST /api/x).', 'Took 99 ms'], now + 60_000)).toBe(false);
    // A different problem still gets through, so a noisy one can't hide it...
    expect(await sendAlert('ai', ['Claude refused a request.'], now + 60_000)).toBe(true);
    expect(await sendAlert('server', ['Something else entirely.'], now + 60_000)).toBe(true);
    // ...up to a few of each kind an hour.
    expect(await sendAlert('server', ['And another thing.'], now + 60_000)).toBe(false);
    expect(await sendAlert('server', ['The next hour.'], now + HOUR)).toBe(true);
    expect(emails.map((e) => e.subject)).toEqual([
      'Our Studio: something broke on the server',
      'Our Studio: something broke on the server',
      'Our Studio: an AI service isn’t answering',
      'Our Studio: something broke on the server',
      'Our Studio: something broke on the server',
    ]);
    expect(emails[0]).toMatchObject({ from: 'Our Studio <studio@evolvingword.com>', to: ['joel@example.com'] });
    expect(emails[0].text).toContain('A request failed (POST /api/x).');
  });

  it('leave out printer-link tokens, addresses and long ids', async () => {
    tempRepo();
    alertsOn();
    await sendAlert('server', ['A request failed (GET /s/Zq3xY7pL0aBcDeFgHiJkLmNo/f/2).', 'Sam (sam@example.com) on abuelas-80th-k3m9x2pq7r: SUPABASE_SERVICE_ROLE_KEY']);
    expect(emails[0].text).toContain('GET /s/…/f/2');
    expect(emails[0].text).toContain('Sam ([email]) on …: SUPABASE_SERVICE_ROLE_KEY');
    expect(emails[0].text).not.toMatch(/Zq3x|sam@|k3m9/);
  });

  it('go out when a request fails in a way nobody planned for', async () => {
    tempRepo();
    alertsOn();
    const handler = api(async () => {
      throw new Error('cannot read properties of undefined');
    });
    const res = await handler(new Request('https://studio.example.com/api/projects/abc/thing'), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).not.toContain('undefined');
    expect(emails).toHaveLength(1);
    expect(emails[0].text).toContain('GET /api/projects/abc/thing');
    expect(emails[0].text).toContain('cannot read properties of undefined');
  });

  it('go out when rate limits can’t be counted, and the request still goes ahead', async () => {
    tempRepo();
    alertsOn();
    vi.spyOn(getRepo(), 'hit').mockRejectedValue(new Error('connection reset'));
    await expect(rateLimit(USERS.erin, 'art')).resolves.toBeUndefined();
    await expect(rateLimit(USERS.erin, 'art')).resolves.toBeUndefined();
    expect(emails).toHaveLength(1);
    expect(emails[0].text).toMatch(/Rate limits couldn’t be counted/);
  });

  it('tell whoever asked what to do next, and keep the details for Joel', async () => {
    tempRepo();
    alertsOn();
    const failing = (e: unknown) =>
      api(async () => {
        throw e;
      })(new Request('https://studio.example.com/api/projects/abc/words', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), { params: Promise.resolve({}) });
    const said = async (res: Response) => ((await res.json()) as { error: string }).error;

    const notSetUp = await failing(new SetupNeeded('Supabase is connected, but the tables aren’t there yet.'));
    expect(notSetUp.status).toBe(503);
    expect(await said(notSetUp)).toBe('A couple of things are still being set up. Try again soon.');
    expect(emails.at(-1)!.text).toContain('the tables aren’t there yet');

    const down = await failing(new DatabaseUnreachable('Couldn’t reach Supabase at abcdefgh.supabase.co (TimeoutError). Check the project isn’t paused.'));
    expect(down.status).toBe(503);
    expect(await said(down)).toBe('Can’t reach the database right now. Try again in a minute.');
    expect(emails.at(-1)!.subject).toBe('Our Studio: something broke on the server');
    expect(emails.at(-1)!.text).toContain('abcdefgh.supabase.co');

    const badKey = await failing(Anthropic.APIError.generate(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers()));
    expect(await said(badKey)).toBe('The AI isn’t working right now. Joel has been sent the details.');
    expect(emails.at(-1)!.text).toMatch(/ANTHROPIC_API_KEY/);
    const theirEnd = await failing(Anthropic.APIError.generate(500, { error: { type: 'api_error', message: 'Internal server error at node 7' } }, 'boom', new Headers()));
    expect(await said(theirEnd)).toBe('Claude had a problem on its end. Try again in a moment.');
    const busy = await failing(Anthropic.APIError.generate(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers()));
    expect(await said(busy)).toBe('Claude’s rate limit was hit. Try again in a minute.');
  });

  it('don’t wait on the database to decide, when the database may be what’s down', async () => {
    tempRepo();
    alertsOn();
    vi.spyOn(getRepo(), 'hit').mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    expect(await sendAlert('server', ['Couldn’t reach the database.'])).toBe(true);
    expect(await sendAlert('server', ['Couldn’t reach the database.'])).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('say what Resend said when the test from Setup doesn’t go', async () => {
    tempRepo();
    await expect(sendTestAlert()).rejects.toThrow(/No RESEND_API_KEY/);
    alertsOn();
    resendSays = { status: 403, body: { message: 'The evolvingword.com domain is not verified.' } };
    await expect(sendTestAlert()).rejects.toThrow('Resend refused it (403): The evolvingword.com domain is not verified.');
    resendSays = { status: 200, body: { id: 'email_2' } };
    expect(await sendTestAlert()).toMatch(/Sent to joel@example\.com/);
  });
});
