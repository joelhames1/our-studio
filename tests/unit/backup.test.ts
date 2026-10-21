// The nightly backup (a month of copies, one per day of the month, and a way
// back) and the alert emails when something breaks (through Resend, at most one
// an hour for each kind of problem).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempRepo } from './helpers';
import { GET as cron } from '@/app/api/cron/backup/route';
import { preset } from '@/lib/design/occasions';
import { sendAlert, sendTestAlert } from '@/lib/server/alerts';
import { api } from '@/lib/server/api';
import { USERS } from '@/lib/server/auth';
import { backUp, lastBackup, restore, type BackupFile } from '@/lib/server/backup';
import { createProject } from '@/lib/server/projects';

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
  process.env.ALERT_EMAIL = 'Joel.Example@gmail.com';
};

describe('nightly backup', () => {
  it('copies every table into the day’s file, and puts a deleted project back', async () => {
    const { repo } = tempRepo();
    const project = await birthday();
    const summary = await backUp(new Date('2026-10-19T10:17:00Z'));
    expect(summary.file).toBe('backups/day-19.json');
    expect(summary.rows.projects).toBeGreaterThanOrEqual(1);
    expect(summary.rows.options).toBeGreaterThan(0);
    expect(await lastBackup()).toEqual(summary);

    const file = JSON.parse((await repo.getAsset('backups/day-19.json'))!.data.toString('utf8')) as BackupFile;
    expect(file).toMatchObject({ kind: 'local', at: '2026-10-19T10:17:00.000Z' });

    await repo.deleteProject(project.id);
    expect(await repo.getProject(project.id)).toBeNull();
    await restore(file);
    expect((await repo.getProject(project.id))?.title).toBe(project.title);
    await expect(restore({ ...file, kind: 'supabase' })).rejects.toThrow(/came from supabase storage/);
  });

  it('keeps a month: the same day next month replaces this month’s copy', async () => {
    tempRepo();
    expect((await backUp(new Date('2026-10-03T10:17:00Z'))).file).toBe('backups/day-03.json');
    expect((await backUp(new Date('2026-11-03T10:17:00Z'))).file).toBe('backups/day-03.json');
    expect((await lastBackup())?.at).toBe('2026-11-03T10:17:00.000Z');
  });

  it('only starts for Vercel’s schedule, and emails when it fails', async () => {
    const { repo } = tempRepo();
    const run = (auth?: string) => cron(new Request('https://studio.example.com/api/cron/backup', { headers: auth ? { authorization: auth } : {} }));
    expect((await run(`Bearer ${SECRET}`)).status).toBe(503); // no CRON_SECRET: off
    process.env.CRON_SECRET = SECRET;
    expect((await run()).status).toBe(401);
    expect((await run('Bearer not-the-secret')).status).toBe(401);
    const ok = await run(`Bearer ${SECRET}`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { file: string }).file).toMatch(/^backups\/day-\d\d\.json$/);

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

  it('send one email an hour for each kind of problem', async () => {
    tempRepo();
    alertsOn();
    // A minute into the current hour (the laptop's counters tidy up against the real clock).
    const now = Math.floor(Date.now() / HOUR) * HOUR + 60_000;
    expect(await sendAlert('server', ['A request failed (POST /api/x).'], now)).toBe(true);
    expect(await sendAlert('server', ['Another one.'], now + 60_000)).toBe(false);
    expect(await sendAlert('ai', ['Claude refused a request.'], now + 60_000)).toBe(true);
    expect(await sendAlert('server', ['The next hour.'], now + HOUR)).toBe(true);
    expect(emails.map((e) => e.subject)).toEqual([
      'Our Studio: something broke on the server',
      'Our Studio: an AI service isn’t answering',
      'Our Studio: something broke on the server',
    ]);
    expect(emails[0]).toMatchObject({ from: 'Our Studio <studio@evolvingword.com>', to: ['joel.example@gmail.com'] });
    expect(emails[0].text).toContain('A request failed (POST /api/x).');
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

  it('say what Resend said when the test from Setup doesn’t go', async () => {
    tempRepo();
    await expect(sendTestAlert()).rejects.toThrow(/No RESEND_API_KEY/);
    alertsOn();
    resendSays = { status: 403, body: { message: 'The evolvingword.com domain is not verified.' } };
    await expect(sendTestAlert()).rejects.toThrow('Resend refused it (403): The evolvingword.com domain is not verified.');
    resendSays = { status: 200, body: { id: 'email_2' } };
    expect(await sendTestAlert()).toMatch(/Sent to joel\.example@gmail\.com/);
  });
});
