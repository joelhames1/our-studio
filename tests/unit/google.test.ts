// "Continue with Google": the trip out (PKCE), the trip back against a
// stand-in for Supabase Auth or for Google's token endpoint, who gets in, and
// personal links switching off.
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as callback } from '@/app/api/auth/callback/route';
import { GET as start } from '@/app/api/auth/google/route';
import { POST as linkSession } from '@/app/api/session/route';
import { COOKIE, sessionCookie, userForLinkToken, userForSession, USERS } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { GOOGLE_TOKEN } from '@/lib/server/google';
import { tempRepo } from './helpers';

const SITE = 'https://studio.example.com';
const KEY = 'sb_secret_test_not_real';
const ERIN_TOKEN = 'e'.repeat(12) + '0123456789abcdef0123456789abcdef';
const JOEL_TOKEN = 'j'.repeat(12) + 'fedcba9876543210fedcba9876543210';
const STRANGER = '0b5e4e2a-1111-4222-8333-944455566677';
const ENV = [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL',
  'ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'SIGN_IN_LINKS', 'SESSION_VERSION', 'VERCEL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

// The stand-in: answers the code exchange with whoever `signedIn` is, and notes every request.
type Seen = { method: string; url: string; apikey?: string; body: Record<string, unknown> };
let seen: Seen[] = [];
let signedIn: object = {};
let status = 200;
let server: http.Server;
let base = '';
let local: ReturnType<typeof tempRepo>['repo'];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, apikey: req.headers.apikey as string | undefined, body: raw ? JSON.parse(raw) : {} });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/auth/v1/token?grant_type=pkce') {
        res.statusCode = status;
        res.end(JSON.stringify(status === 200 ? { access_token: 'at', refresh_token: 'rt', user: signedIn } : { code: status, error_code: 'bad_code_verifier', msg: 'nope' }));
      } else res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  // People, households and the activity log on a laptop; only sign-in itself goes to the stand-in.
  local = tempRepo().repo;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SECRET_KEY = KEY;
  process.env.ERIN_GOOGLE_EMAIL = 'Erin.Example@gmail.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel.example@gmail.com';
  seen = [];
  status = 200;
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const googleUser = (email: string, extra: object = {}) => ({
  id: STRANGER,
  email,
  identities: [{ provider: 'google', identity_data: { email, email_verified: true, ...extra } }],
});

/** Leaves for Google, and returns the verifier this browser now holds. */
async function leave(): Promise<string> {
  const res = await start(new Request(`${SITE}/api/auth/google`));
  return res.cookies.get('studio_pkce')!.value;
}

const comeBack = (query: string, verifier?: string) =>
  callback(new NextRequest(`${SITE}/api/auth/callback?${query}`, { headers: verifier ? { cookie: `studio_pkce=${verifier}` } : {} }));

describe('continue with Google', () => {
  it('leaves for Google with a one-time verifier only this browser holds', async () => {
    const res = await start(new Request(`${SITE}/api/auth/google`));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(`${to.origin}${to.pathname}`).toBe(`${base}/auth/v1/authorize`);
    expect(to.searchParams.get('provider')).toBe('google');
    expect(to.searchParams.get('redirect_to')).toBe(`${SITE}/api/auth/callback`);
    expect(to.searchParams.get('code_challenge_method')).toBe('s256');
    const cookie = res.cookies.get('studio_pkce')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600 });
    expect(cookie.value).toMatch(/^[\w-]{43}$/);
    // Google only ever sees the challenge, never the verifier.
    expect(to.searchParams.get('code_challenge')).toBe(createHash('sha256').update(cookie.value).digest('base64url'));
    expect(res.headers.get('location')).not.toContain(cookie.value);
    expect(seen).toEqual([]);
  });

  it('signs Erin in, matched on the address Google vouches for', async () => {
    const verifier = await leave();
    signedIn = googleUser('erin.example@GMAIL.com');
    const res = await comeBack('code=abc123', verifier);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${SITE}/`);
    expect(await userForSession(res.cookies.get(COOKIE)!.value)).toEqual(USERS.erin);
    // The verifier is spent, and Supabase got exactly what the PKCE exchange needs.
    expect(res.cookies.get('studio_pkce')).toMatchObject({ value: '', maxAge: 0 });
    const auth = seen.filter((s) => s.url.startsWith('/auth/'));
    expect(auth).toEqual([{ method: 'POST', url: '/auth/v1/token?grant_type=pkce', apikey: KEY, body: { auth_code: 'abc123', code_verifier: verifier } }]);
    expect(res.headers.get('cache-control')).toBe('no-store');
    // And the household's activity log has it.
    const [logged] = await local.listActivity({ action: 'signed-in', limit: 5 });
    expect(logged).toMatchObject({ by: 'erin', action: 'signed-in', detail: 'with Google', householdId: 'first' });
  });

  it('turns anyone else away and deletes the record Supabase made for them', async () => {
    const verifier = await leave();
    signedIn = googleUser('someone.else@gmail.com');
    const res = await comeBack('code=abc123', verifier);
    expect(res.headers.get('location')).toBe(`${SITE}/?signin=not-invited`);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(['POST /auth/v1/token?grant_type=pkce', `DELETE /auth/v1/admin/users/${STRANGER}`]);
  });

  it('only takes Google’s word for it', async () => {
    const verifier = await leave();
    // Someone who made an account with Erin's address some other way.
    signedIn = { id: STRANGER, email: 'erin.example@gmail.com', identities: [{ provider: 'email', identity_data: { email: 'erin.example@gmail.com' } }] };
    expect((await comeBack('code=abc', verifier)).headers.get('location')).toBe(`${SITE}/?signin=failed`);
    signedIn = googleUser('erin.example@gmail.com', { email_verified: false });
    expect((await comeBack('code=abc', verifier)).headers.get('location')).toBe(`${SITE}/?signin=unverified`);
  });

  it('needs the verifier from the browser that left', async () => {
    signedIn = googleUser('erin.example@gmail.com');
    const res = await comeBack('code=abc123');
    expect(res.headers.get('location')).toBe(`${SITE}/?signin=expired`);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it('says so when Google or Supabase says no', async () => {
    const verifier = await leave();
    expect((await comeBack('error=access_denied&error_description=The+user+denied', verifier)).headers.get('location')).toBe(`${SITE}/?signin=cancelled`);
    expect((await comeBack('error=server_error', verifier)).headers.get('location')).toBe(`${SITE}/?signin=failed`);
    status = 400;
    expect((await comeBack('code=stale', verifier)).headers.get('location')).toBe(`${SITE}/?signin=failed`);
  });

  it('goes to Supabase Auth even when the Project URL was pasted with extra on the end', async () => {
    process.env.SUPABASE_URL = `${base}/rest/v1/`;
    const to = new URL((await start(new Request(`${SITE}/api/auth/google`))).headers.get('location')!);
    expect(`${to.origin}${to.pathname}`).toBe(`${base}/auth/v1/authorize`);
    const verifier = await leave();
    signedIn = googleUser('joel.example@gmail.com');
    expect(await userForSession((await comeBack('code=abc', verifier)).cookies.get(COOKIE)!.value)).toEqual(USERS.joel);
    expect(seen.filter((s) => s.url.startsWith('/auth/')).at(-1)!.url).toBe('/auth/v1/token?grant_type=pkce');
  });

  it('stays off until Supabase or the site’s own Google client is connected', async () => {
    // Who gets in is up to the households, not these: no addresses just means nobody's on the list yet.
    delete process.env.ERIN_GOOGLE_EMAIL;
    delete process.env.JOEL_GOOGLE_EMAIL;
    expect(config.googleSignIn).toBe(true);
    delete process.env.SUPABASE_SECRET_KEY;
    expect(config.googleSignIn).toBe(false);
    expect((await start(new Request(`${SITE}/api/auth/google`))).headers.get('location')).toBe(`${SITE}/?signin=off`);
  });
});

describe('straight to Google, with the site’s own client', () => {
  const CLIENT = '1234567890-abcdefghij.apps.googleusercontent.com';
  const SECRET = 'GOCSPX-not-a-real-secret';
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  /** An ID token as Google's token endpoint returns it; the signature is never read. */
  const idToken = (claims: object) => [b64({ alg: 'RS256', typ: 'JWT' }), b64({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 3600, ...claims }), 'sig'].join('.');

  // Google's token endpoint, stood in for; everything else (the activity log) goes to the Supabase stand-in.
  let answer: { status: number; body: object } | 'down' = { status: 200, body: {} };
  let toGoogle: URLSearchParams[] = [];
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT;
    process.env.GOOGLE_CLIENT_SECRET = SECRET;
    toGoogle = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== GOOGLE_TOKEN) return realFetch(input, init);
      toGoogle.push(new URLSearchParams(String(init?.body)));
      if (answer === 'down') throw new TypeError('fetch failed');
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(() => vi.restoreAllMocks());
  const googleSays = (claims: object) => (answer = { status: 200, body: { access_token: 'at', id_token: idToken(claims), token_type: 'Bearer' } });

  it('leaves for Google itself, asking only for the email address', async () => {
    const res = await start(new Request(`${SITE}/api/auth/google`));
    const to = new URL(res.headers.get('location')!);
    expect(`${to.origin}${to.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: CLIENT,
      redirect_uri: `${SITE}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    const verifier = res.cookies.get('studio_pkce')!.value;
    expect(to.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
    // Neither the verifier nor the secret goes anywhere near the browser.
    expect(res.headers.get('location')).not.toContain(verifier);
    expect(res.headers.get('location')).not.toContain(SECRET);
  });

  it('signs Joel in, trading the code with Google and nobody else', async () => {
    const verifier = await leave();
    googleSays({ email: 'Joel.Example@gmail.com', email_verified: true });
    const res = await comeBack('code=4%2F0abc', verifier);
    expect(res.headers.get('location')).toBe(`${SITE}/`);
    expect(await userForSession(res.cookies.get(COOKIE)!.value)).toEqual(USERS.joel);
    expect(toGoogle.map((b) => Object.fromEntries(b))).toEqual([
      { grant_type: 'authorization_code', code: '4/0abc', code_verifier: verifier, redirect_uri: `${SITE}/api/auth/callback`, client_id: CLIENT, client_secret: SECRET },
    ]);
    expect(seen.filter((s) => s.url.startsWith('/auth/'))).toEqual([]);
    expect(res.cookies.get('studio_pkce')).toMatchObject({ value: '', maxAge: 0 });
  });

  it('turns anyone else away, with nothing to clean up afterwards', async () => {
    const verifier = await leave();
    googleSays({ email: 'someone.else@gmail.com', email_verified: true });
    const res = await comeBack('code=abc', verifier);
    expect(res.headers.get('location')).toBe(`${SITE}/?signin=not-invited`);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it('only believes a token Google made for this site, for an address it has checked', async () => {
    const verifier = await leave();
    const tryWith = async () => (await comeBack('code=abc', verifier)).headers.get('location');
    googleSays({ email: 'erin.example@gmail.com', email_verified: true, aud: 'someone-elses-client.apps.googleusercontent.com' });
    expect(await tryWith()).toBe(`${SITE}/?signin=failed`);
    googleSays({ email: 'erin.example@gmail.com', email_verified: true, iss: 'https://evil.example' });
    expect(await tryWith()).toBe(`${SITE}/?signin=failed`);
    googleSays({ email: 'erin.example@gmail.com', email_verified: true, exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await tryWith()).toBe(`${SITE}/?signin=failed`);
    answer = { status: 200, body: { id_token: 'not-a-token' } };
    expect(await tryWith()).toBe(`${SITE}/?signin=failed`);
    googleSays({ email: 'erin.example@gmail.com', email_verified: false });
    expect(await tryWith()).toBe(`${SITE}/?signin=unverified`);
    googleSays({ email: 'erin.example@gmail.com' });
    expect(await tryWith()).toBe(`${SITE}/?signin=unverified`);
  });

  it('says so when Google refuses the code or can’t be reached', async () => {
    const verifier = await leave();
    answer = { status: 400, body: { error: 'invalid_grant' } };
    expect((await comeBack('code=stale', verifier)).headers.get('location')).toBe(`${SITE}/?signin=failed`);
    answer = 'down';
    expect((await comeBack('code=abc', verifier)).headers.get('location')).toBe(`${SITE}/?signin=failed`);
    expect((await comeBack('error=access_denied', verifier)).headers.get('location')).toBe(`${SITE}/?signin=cancelled`);
  });

  it('needs no Supabase at all, and a pasted secret in place of the client ID means Supabase stays in charge', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(config.googleSignIn).toBe(true);
    process.env.SUPABASE_URL = base;
    process.env.SUPABASE_SECRET_KEY = KEY;
    process.env.GOOGLE_CLIENT_ID = SECRET;
    expect(config.googleDirect).toBe(false);
    const to = new URL((await start(new Request(`${SITE}/api/auth/google`))).headers.get('location')!);
    expect(`${to.origin}${to.pathname}`).toBe(`${base}/auth/v1/authorize`);
  });
});

describe('sessions with Google, and switching links off', () => {
  it('signs sessions without any link tokens, and SESSION_VERSION still signs everyone out', async () => {
    const joel = sessionCookie('joel').value;
    expect(await userForSession(joel)).toEqual(USERS.joel);
    expect(joel).not.toContain(KEY);
    process.env.SESSION_VERSION = '2';
    expect(await userForSession(joel)).toBeNull();
  });

  it('turns links off without signing anyone out', async () => {
    process.env.ERIN_LINK_TOKEN = ERIN_TOKEN;
    process.env.JOEL_LINK_TOKEN = JOEL_TOKEN;
    const fromLink = sessionCookie('erin').value;
    process.env.SIGN_IN_LINKS = 'off';
    expect(config.linksConfigured).toBe(false);
    expect(config.authConfigured).toBe(true);
    expect(await userForLinkToken(ERIN_TOKEN)).toBeNull();
    expect(await userForSession(fromLink)).toEqual(USERS.erin);
    const res = await linkSession(
      new Request(`${SITE}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ token: ERIN_TOKEN }) }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(410);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
