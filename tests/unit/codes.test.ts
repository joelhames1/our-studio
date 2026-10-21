// "Email me a code": six digits through Resend, good for 10 minutes in the
// browser that asked, 5 tries, one use; the same answer for every address;
// and sessions that work when codes are the only way in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempRepo, signedIn } from './helpers';
import { POST as check } from '@/app/api/auth/code/check/route';
import { POST as send } from '@/app/api/auth/code/route';
import { COOKIE, sessionCookie, userForSession, USERS } from '@/lib/server/auth';
import { checkCode, CODE_COOKIE, sendCode } from '@/lib/server/codes';
import { config } from '@/lib/server/config';
import { RESEND } from '@/lib/server/email';

const SITE = 'https://studio.example.com';
const ENV = [
  'RESEND_API_KEY', 'EMAIL_FROM', 'ALERT_FROM', 'ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'VERCEL',
];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

// Resend, stood in for.
let emails: { from: string; to: string[]; subject: string; text: string; html?: string }[] = [];
let resendStatus = 200;

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  process.env.ERIN_GOOGLE_EMAIL = 'Erin@Example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
  emails = [];
  resendStatus = 200;
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== RESEND) return realFetch(input, init);
    if (resendStatus === 200) emails.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(resendStatus === 200 ? { id: 'email_1' } : { message: 'The API key is invalid' }), {
      status: resendStatus,
      headers: { 'content-type': 'application/json' },
    });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const post = (path: string, body: object, cookie?: string) =>
  new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({}) };
/** The value a response set for a cookie, and the rest of its Set-Cookie line. */
const setCookie = (res: Response, name: string) => {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? '';
  return { value: line.slice(name.length + 1).split(';')[0], line };
};
const codeIn = (i = emails.length - 1) => emails[i].subject.slice(0, 6);
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('email codes', () => {
  it('email an invited address six digits, which sign that browser in once', async () => {
    const { repo } = tempRepo();
    expect(config.emailCodes).toBe(true);
    const asked = await send(post('/api/auth/code', { email: '  Erin@EXAMPLE.com ' }), ctx);
    expect(asked.status).toBe(200);
    expect(await asked.json()).toEqual({ ok: true, to: 'erin@example.com' });
    const held = setCookie(asked, CODE_COOKIE);
    expect(held.line).toMatch(/HttpOnly/i);
    expect(held.line).toMatch(/SameSite=Strict/i);
    expect(held.line).toMatch(/Path=\/;/);
    expect(held.line).toMatch(/SameSite=Strict/i);
    expect(held.line).toMatch(/Max-Age=600/);

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ from: 'Our Studio <studio@evolvingword.com>', to: ['erin@example.com'] });
    expect(emails[0].subject).toMatch(/^\d{6} is your Our Studio code$/);
    const code = codeIn();
    expect(emails[0].text).toContain(`Your Our Studio code is ${code}`);
    // Neither the code nor the address sits in the cookie as itself.
    expect(held.value).not.toContain(code);
    expect(held.value).not.toContain('erin');

    const res = await check(post('/api/auth/code/check', { code: `${code.slice(0, 3)} ${code.slice(3)}` }, `${CODE_COOKIE}=${held.value}`), ctx);
    expect(res.status).toBe(200);
    expect(await userForSession(setCookie(res, COOKIE).value)).toEqual(USERS.erin);
    expect(setCookie(res, CODE_COOKIE).line).toMatch(/Max-Age=0/);
    expect((await repo.listActivity({ by: 'erin', action: 'signed-in', limit: 5 }))[0]?.detail).toBe('with an email code');

    // The same code again, from the same browser: no.
    const again = await check(post('/api/auth/code/check', { code }, `${CODE_COOKIE}=${held.value}`), ctx);
    expect(again.status).toBe(401);
    expect((await again.json()).error).toMatch(/already been used/);
  });

  it('give every address the same answer, and email only the invited', async () => {
    tempRepo();
    const res = await send(post('/api/auth/code', { email: 'someone.else@example.com' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, to: 'someone.else@example.com' });
    expect(setCookie(res, CODE_COOKIE).value).not.toBe('');
    expect(emails).toEqual([]);
    // Whatever they type, it's just a wrong code.
    const tried = await check(post('/api/auth/code/check', { code: '123456' }, `${CODE_COOKIE}=${setCookie(res, CODE_COOKIE).value}`), ctx);
    expect(tried.status).toBe(401);
    expect((await tried.json()).error).toMatch(/isn’t right/);

    expect((await send(post('/api/auth/code', { email: 'not an address' }), ctx)).status).toBe(400);
    // From another site's page: refused before anything is sent.
    const cross = new Request(`${SITE}/api/auth/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ email: 'erin@example.com' }),
    });
    expect((await send(cross, ctx)).status).toBe(403);
    expect(emails).toEqual([]);
  });

  it('allow five tries at a code, then it’s dead', async () => {
    tempRepo();
    const { cookie } = await sendCode('joel@example.com');
    const code = codeIn();
    const said: string[] = [];
    for (let i = 0; i < 5; i++) said.push(await checkCode(cookie, wrong(code)).then(() => 'in', (e: Error) => e.message));
    expect(said).toEqual([
      'That code isn’t right. 4 more tries.',
      'That code isn’t right. 3 more tries.',
      'That code isn’t right. 2 more tries.',
      'That code isn’t right. One more try.',
      'That code isn’t right. Ask for a new one.',
    ]);
    await expect(checkCode(cookie, code)).rejects.toMatchObject({ status: 429 });
  });

  it('only work for ten minutes, in the browser that asked, for the address it went to', async () => {
    const { repo } = tempRepo();
    const now = Date.now();
    const { cookie } = await sendCode('erin@example.com', now);
    const code = codeIn();
    await expect(checkCode(cookie, code, now + 10 * 60_000 + 1000)).rejects.toMatchObject({ status: 410 });
    await expect(checkCode(undefined, code, now)).rejects.toMatchObject({ status: 400 });
    await expect(checkCode('junk.%E0%A4%A.1.x', code, now)).rejects.toMatchObject({ status: 400 });
    await expect(checkCode(cookie, '12345', now)).rejects.toMatchObject({ status: 400 });
    // Erin's code in a cookie rewritten to say Joel: the signature doesn't match.
    const [nonce, , exp, mac] = cookie.split('.');
    const asJoel = [nonce, Buffer.from('joel@example.com').toString('base64url'), exp, mac].join('.');
    await expect(checkCode(asJoel, code, now)).rejects.toMatchObject({ status: 401 });
    // A later expiry than any code has is made up: refused before anything is counted, so forged cookies can't leave counters behind forever.
    const hit = vi.spyOn(repo, 'hit');
    await expect(checkCode([nonce, cookie.split('.')[1], 999999999999, mac].join('.'), code, now)).rejects.toMatchObject({ status: 400 });
    expect(hit).not.toHaveBeenCalled();
    hit.mockRestore();
    expect(await checkCode(cookie, code, now)).toEqual(USERS.erin);
  });

  it('can’t be turned into a mailing list, or used to lock someone out', async () => {
    tempRepo();
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000 + 60_000;
    // Only plain addresses: nothing for a mail service to read a second recipient into.
    for (const odd of ['Erin <erin@example.com>', 'erin@example.com, joel@example.com', '"erin"@example.com', 'erín@example.com']) {
      await expect(sendCode(odd, hour)).rejects.toMatchObject({ status: 400 });
    }
    // Someone else's network asking for Erin's address doesn't use up Erin's own.
    for (let i = 0; i < 5; i++) await sendCode('erin@example.com', hour + i, undefined, 'attacker');
    await expect(sendCode('erin@example.com', hour + 10, undefined, 'attacker')).rejects.toMatchObject({ status: 429 });
    await sendCode('erin@example.com', hour + 20, undefined, 'erins-phone');
    // One network can't spray codes at everyone either: every request counts, refused or not (6 so far, 20 an hour).
    for (let i = 0; i < 14; i++) await sendCode(`stranger${i}@example.com`, hour + 100 + i, undefined, 'attacker');
    await expect(sendCode('stranger99@example.com', hour + 200, undefined, 'attacker')).rejects.toMatchObject({ status: 429 });
    // And the whole site stops at its daily number, so the email service's quota is never all used up.
    process.env.CODE_EMAILS_PER_DAY = '7';
    const sent = emails.length;
    for (let i = sent; i < 7; i++) await sendCode('joel@example.com', hour + 300 + i, undefined, `net${i}`);
    await expect(sendCode('joel@example.com', hour + 400, undefined, 'another')).rejects.toMatchObject({ status: 503 });
    expect(emails).toHaveLength(7);
    delete process.env.CODE_EMAILS_PER_DAY;
  });

  it('send at most five codes an hour to one address', async () => {
    tempRepo();
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000 + 60_000;
    for (let i = 0; i < 5; i++) await sendCode('joel@example.com', hour + i * 1000);
    await expect(sendCode('Joel@Example.com', hour + 10_000)).rejects.toMatchObject({ status: 429 });
    expect(emails).toHaveLength(5);
    // Another address has its own count.
    await sendCode('erin@example.com', hour + 10_000);
    expect(emails).toHaveLength(6);
  });

  it('say so when the email doesn’t go, and stop when they can’t be counted', async () => {
    const { repo } = tempRepo();
    resendStatus = 401;
    await expect(sendCode('erin@example.com')).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/didn’t go out/) });
    resendStatus = 200;
    vi.spyOn(repo, 'hit').mockResolvedValueOnce(null);
    await expect(sendCode('erin@example.com')).rejects.toMatchObject({ status: 503 });
    vi.spyOn(repo, 'hit').mockRejectedValueOnce(new Error('database unreachable'));
    await expect(sendCode('erin@example.com')).rejects.toMatchObject({ status: 503 });
    expect(emails).toEqual([]);
  });

  it('are off without Resend or the server’s secret, and only reach people in a household', async () => {
    tempRepo();
    delete process.env.RESEND_API_KEY;
    expect(config.emailCodes).toBe(false);
    await expect(sendCode('erin@example.com')).rejects.toMatchObject({ status: 404 });
    process.env.RESEND_API_KEY = 're_test_not_real';
    delete process.env.SUPABASE_SECRET_KEY;
    expect(config.emailCodes).toBe(false);
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
    // With nobody's address known, they're on but nobody gets one.
    delete process.env.ERIN_GOOGLE_EMAIL;
    delete process.env.JOEL_GOOGLE_EMAIL;
    expect(config.emailCodes).toBe(true);
    await sendCode('erin@example.com');
    expect(emails).toEqual([]);
  });
});

describe('sessions', () => {
  it('are signed with the server’s secret when email codes are the only way in', async () => {
    // No Google client and no Supabase address: Google sign-in is off, codes are on.
    expect(config.googleSignIn).toBe(false);
    expect(config.emailCodes).toBe(true);
    expect(config.authConfigured).toBe(true);
    expect(config.devLogin).toBe(false);
    expect(await userForSession(await signedIn('joel'))).toEqual(USERS.joel);
  });

  it('can’t be made without a server secret', () => {
    // The site's own Google client but no Supabase key: nothing to sign with, so no sessions rather than weak ones.
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.GOOGLE_CLIENT_ID = '1234-abc.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-test-not-real';
    expect(config.googleSignIn).toBe(true);
    expect(() => sessionCookie('erin')).toThrow(/isn’t set up/);
  });
});
