// Who's signed in. Three ways in: "Continue with Google" (google.ts), a
// six-digit code by email (codes.ts), or a private personal link whose token
// is traded for a session on that phone. Every way ends with the same signed
// session cookie (see session.ts for what it holds), and the person it names
// is looked up in the directory of people and households (people.ts). No
// passwords, nothing to remember.
import { cookies } from 'next/headers';
import type { User, UserId } from '@/lib/engine/types';
import { config } from './config';
import { assumeHousehold } from './context';
import { HttpError } from './errors';
import { FOUNDERS, personById, userByEmail, userById } from './people';
import { readSession, sameSecret, SESSION_DAYS, signSession } from './session';
import { openSession, sessionAlive } from './sessions';

export { HttpError };

export const COOKIE = 'studio_session';
/** Which of your households this browser is working in, for people in more than one. */
export const HOUSEHOLD_COOKIE = 'studio_household';

/** The first household's two people, as they were before households. */
export const USERS = FOUNDERS;

/** Whoever runs the site. */
export const ADMIN = FOUNDERS.joel;

/** "you" for the admin, their name for everyone else: "Joel can add…" / "you can add…". */
export function whoFixes(user: User): string {
  return user.admin ? 'You' : ADMIN.name;
}

/**
 * The secret each person's sessions are signed with: Joel's and Erin's link
 * tokens while they have them (so changing one signs just that person out),
 * otherwise the server's own secret, for Google and email codes.
 */
function secretFor(id: UserId): string | undefined {
  const real = id === 'erin' ? config.erinToken : id === 'joel' ? config.joelToken : undefined;
  if (real) return real;
  if (config.googleSignIn || config.emailCodes) return config.serverSecret;
  // The laptop-only picker has no real tokens; anyone there can pick anyone anyway.
  return config.devLogin ? `dev-only-${id}` : undefined;
}

/** Maps a link token to Joel or Erin, unless links are switched off. */
export async function userForLinkToken(token: unknown): Promise<User | null> {
  if (config.linksOff) return null;
  if (typeof token !== 'string' || !token || token.length > 200) return null;
  if (config.erinToken && sameSecret(token, config.erinToken)) return userById('erin');
  if (config.joelToken && sameSecret(token, config.joelToken)) return userById('joel');
  return null;
}

/** Whoever signs in with this address, through Google or an emailed code. */
export const userForEmail = userByEmail;

/**
 * Who a session cookie value belongs to: null if it's forged or expired, if
 * that browser was signed out (from the list of your devices, or "sign out
 * everywhere"), or they're no longer in any household.
 */
export async function userForSession(value: string | undefined | null, now?: number, household?: string): Promise<User | null> {
  const s = readSession(value, secretFor, config.sessionVersion, now);
  if (!s) return null;
  const cutoff = (await personById(s.id))?.signedOutAt;
  if (cutoff && s.iat * 1000 < Date.parse(cutoff)) return null;
  if (s.sid && !(await sessionAlive(s.sid, s.id))) return null;
  return userById(s.id, household);
}

/** Which signed-in browser this is, if its cookie says (see sessions.ts). */
export async function currentSessionId(): Promise<string | undefined> {
  const jar = await cookies();
  return readSession(jar.get(COOKIE)?.value, secretFor, config.sessionVersion)?.sid;
}

export async function getUser(): Promise<User | null> {
  const jar = await cookies();
  return userForSession(jar.get(COOKIE)?.value, undefined, jar.get(HOUSEHOLD_COOKIE)?.value);
}

/** Remembers which household this browser works in. */
export function householdCookie(id: string) {
  return { name: HOUSEHOLD_COOKIE, value: id, httpOnly: true, secure: config.isProduction, sameSite: 'lax' as const, path: '/', maxAge: id ? SESSION_DAYS * 86400 : 0 };
}

/** A fresh signed session for this person, ready for `res.cookies.set`: for a browser on their list (`sid`), or not. */
export function sessionCookie(id: UserId, sid?: string, now = Date.now()) {
  const secret = secretFor(id);
  if (!secret) throw new HttpError(503, 'Sign-in isn’t set up yet.');
  return {
    name: COOKIE,
    value: signSession(id, secret, config.sessionVersion, now, sid),
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  };
}

/** Signs this browser in: adds it to the person's list of devices, and returns the cookie. */
export async function startSession(id: UserId, req: Request, via: string) {
  if (!secretFor(id)) throw new HttpError(503, 'Sign-in isn’t set up yet.');
  const sid = await openSession(id, req.headers.get('user-agent'), via);
  return sessionCookie(id, sid ?? undefined);
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new HttpError(401, 'Please sign in again.');
  // Unless a project says otherwise, AI spent on this request comes out of the household you're working in.
  assumeHousehold(user.household);
  return user;
}
