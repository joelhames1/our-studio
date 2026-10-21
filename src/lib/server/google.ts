// "Continue with Google". Google confirms who you are once; if the address
// belongs to someone in a household (people.ts) you get the app's usual signed
// session (auth.ts). Anyone else is turned away.
//
// With the site's own OAuth client set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
// it goes straight to Google and back, so Google's screen names this site.
// Without it, it goes through Supabase Auth as it used to: Supabase's tokens are
// thrown away, and a stranger's Supabase record is deleted.
//
// Either way it's PKCE done on the server: a random verifier waits in a
// short-lived cookie while you're at Google, so a code that comes back to any
// other browser is useless.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { User } from '@/lib/engine/types';
import { userForEmail } from './auth';
import { joinOnSignIn } from './invites';
import { personByEmail } from './people';
import { config } from './config';

export const PKCE_COOKIE = 'studio_pkce';
export const CALLBACK_PATH = '/api/auth/callback';
const COOKIE_PATH = '/api/auth';
const WAIT_SECONDS = 10 * 60;
const TIMEOUT_MS = 10_000;

/** Why a sign-in didn't happen, as shown on the welcome screen. */
export type Refusal = 'off' | 'cancelled' | 'expired' | 'failed' | 'not-invited' | 'unverified' | 'invite-gone' | 'closed' | 'switched-off';
export const REFUSALS: readonly Refusal[] = ['off', 'cancelled', 'expired', 'failed', 'not-invited', 'unverified', 'invite-gone', 'closed', 'switched-off'];

interface SupabaseUser {
  id?: string;
  identities?: { provider?: string; identity_data?: { email?: unknown; email_verified?: unknown } }[];
}

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const authUrl = () => `${config.supabaseUrl}/auth/v1`;
const headers = () => ({ apikey: config.supabaseKey!, Authorization: `Bearer ${config.supabaseKey}`, 'Content-Type': 'application/json' });

/** Where to send the browser, and the verifier to hold on to until it's back. */
export function startGoogle(origin: string): { url: string; verifier: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const back = `${origin}${CALLBACK_PATH}`;
  if (config.googleDirect) {
    const params = new URLSearchParams({
      client_id: config.googleClientId!,
      redirect_uri: back,
      response_type: 'code',
      // Just the email address: it's all the app uses.
      scope: 'openid email',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // Choose the account, so a work account that's signed in doesn't get used by accident.
      prompt: 'select_account',
    });
    return { url: `${GOOGLE_AUTHORIZE}?${params}`, verifier };
  }
  const params = new URLSearchParams({ provider: 'google', redirect_to: back, code_challenge: challenge, code_challenge_method: 's256' });
  return { url: `${authUrl()}/authorize?${params}`, verifier };
}

/**
 * Trades the code Google sent back for one of us, or says why not. `invite`
 * is the invite this browser opened, if any (see invites.ts): it lets someone
 * new in, or adds a household to someone we know.
 */
export async function finishGoogle(code: unknown, verifier: unknown, origin: string, invite?: unknown): Promise<User | Refusal> {
  if (!config.googleSignIn) return 'off';
  if (typeof verifier !== 'string' || !/^[\w-]{43}$/.test(verifier)) return 'expired';
  if (typeof code !== 'string' || !code || code.length > 512) return 'failed';
  return config.googleDirect ? fromGoogle(code, verifier, origin, invite) : fromSupabase(code, verifier, invite);
}

/** Whoever the address Google vouches for belongs to, using this browser's invite first if it has one. */
async function arrive(email: unknown, verified: boolean, invite: unknown): Promise<User | Refusal> {
  const joined = typeof email === 'string' && verified ? await joinOnSignIn(invite, email) : null;
  if (joined === 'switched-off') return 'switched-off';
  if (joined && joined !== 'gone') return joined;
  const who = await userForEmail(email);
  if (!who && typeof email === 'string' && verified) {
    // Google vouches it's them, so they can be told their account is closed rather than that they're unknown.
    const archived = (await personByEmail(email))?.archivedWhy;
    if (archived) return archived;
  }
  // An invite that can't be used now doesn't stop someone we already know.
  if (!who) return joined === 'gone' ? 'invite-gone' : 'not-invited';
  if (!verified) return 'unverified';
  return who;
}

interface IdToken {
  iss: string;
  aud: string;
  exp: number;
  email?: unknown;
  email_verified?: unknown;
}

/** The claims in a Google ID token, or null if it isn't one. */
function readIdToken(token: unknown): IdToken | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof c.iss === 'string' && typeof c.aud === 'string' && typeof c.exp === 'number' ? (c as unknown as IdToken) : null;
  } catch {
    return null;
  }
}

/** Straight to Google: trades the code at Google's token endpoint and reads who it vouches for. */
async function fromGoogle(code: string, verifier: string, origin: string, invite: unknown): Promise<User | Refusal> {
  let token: unknown;
  try {
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: `${origin}${CALLBACK_PATH}`,
        client_id: config.googleClientId!,
        client_secret: config.googleClientSecret!,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('Google sign-in: Google refused the code', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return 'failed';
    }
    token = ((await res.json()) as { id_token?: unknown }).id_token;
  } catch (e) {
    console.error('Google sign-in: couldn’t reach Google', e);
    return 'failed';
  }
  // It came straight from Google's token endpoint over HTTPS, so its signature
  // needn't be checked (OpenID Connect Core 3.1.3.7). What it says still is.
  const id = readIdToken(token);
  if (!id || !GOOGLE_ISSUERS.includes(id.iss) || id.aud !== config.googleClientId || id.exp * 1000 <= Date.now()) {
    console.error('Google sign-in: the ID token wasn’t one for this site');
    return 'failed';
  }
  return arrive(id.email, id.email_verified === true, invite);
}

/** Through Supabase Auth, for a site without its own OAuth client. */
async function fromSupabase(code: string, verifier: string, invite: unknown): Promise<User | Refusal> {
  let user: SupabaseUser | undefined;
  try {
    const res = await fetch(`${authUrl()}/token?grant_type=pkce`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('Google sign-in: Supabase refused the code', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return 'failed';
    }
    user = ((await res.json()) as { user?: SupabaseUser }).user;
  } catch (e) {
    console.error('Google sign-in: couldn’t reach Supabase', e);
    return 'failed';
  }
  // Only a Google identity counts, matched on the address Google vouches for.
  const google = user?.identities?.find((i) => i.provider === 'google');
  if (!user || !google) return 'failed';
  const who = await arrive(google.identity_data?.email, google.identity_data?.email_verified !== false, invite);
  if (who === 'not-invited' || who === 'invite-gone') await forget(user.id);
  return who;
}

/** Deletes a stranger's Supabase record, so the only accounts there are ours. Best effort. */
async function forget(id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await fetch(`${authUrl()}/admin/users/${id}`, { method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch (e) {
    console.error('Google sign-in: couldn’t remove an uninvited account', e);
  }
}

/** The short-lived cookie that holds the verifier while you're at Google. */
export function verifierCookie(value: string) {
  return { name: PKCE_COOKIE, value, httpOnly: true, secure: config.isProduction, sameSite: 'lax' as const, path: COOKIE_PATH, maxAge: value ? WAIT_SECONDS : 0 };
}

/** Back to the welcome screen, saying why. */
export function refused(origin: string, why: Refusal) {
  return NextResponse.redirect(new URL(`/?signin=${why}`, origin), 303);
}
