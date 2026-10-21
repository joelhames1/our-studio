// Signed-in browsers, so you can see where you're signed in and sign any of
// them out. Each sign-in gets a record (a short device name like "iPhone ·
// Safari", how they signed in, when, and when it was last used) and its id goes
// in the session cookie. Every request checks the record is still there,
// remembered for half a minute per server, so signing a browser out takes
// effect within that. Once the list exists, a cookie that isn't on it doesn't
// count, and if the list can't be read nobody's let in on trust.
import 'server-only';
import { customAlphabet } from 'nanoid';
import type { SessionRecord, User, UserId } from '@/lib/engine/types';
import { HttpError } from './errors';
import { directoryStored, forgetDirectory, personById } from './people';
import { DatabaseUnreachable, getRepo } from './repo';

const newSid = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 16);
const TTL = 30_000;
/** How often "last used" is brought up to date. */
const TOUCH = 3600_000;

const g = globalThis as typeof globalThis & { __studioSessions?: Map<string, { at: number; rec: SessionRecord | null }> };
const seen = (g.__studioSessions ??= new Map());

/** "iPhone · Safari", from the browser's description. Only this short name is kept. */
export function deviceOf(ua: string | null | undefined): string {
  const u = ua ?? '';
  const os = /iPhone/.test(u)
    ? 'iPhone'
    : /iPad/.test(u)
      ? 'iPad'
      : /Android/.test(u)
        ? 'Android'
        : /CrOS/.test(u)
          ? 'Chromebook'
          : /Macintosh|Mac OS X/.test(u)
            ? 'Mac'
            : /Windows/.test(u)
              ? 'Windows'
              : /Linux/.test(u)
                ? 'Linux'
                : 'A device';
  const browser = /Edg(e|A|iOS)?\//.test(u)
    ? 'Edge'
    : /OPR\//.test(u)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(u)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(u)
          ? 'Chrome'
          : /Safari\//.test(u)
            ? 'Safari'
            : 'a browser';
  return `${os} · ${browser}`;
}

const g2 = globalThis as typeof globalThis & { __studioSessionsListed?: { at: number; listed: boolean } };

/** Whether the list of signed-in browsers exists yet (the setup file 0007). Once it does, that's for good; until then, asked again every few minutes. */
export async function sessionsListed(): Promise<boolean> {
  const known = g2.__studioSessionsListed;
  if (known && (known.listed || Date.now() - known.at < 300_000)) return known.listed;
  let listed = true;
  try {
    listed = (await getRepo().listSessions('nobody')) !== null;
  } catch (e) {
    // Can't tell: treat it as there, so a cookie without a place on the list isn't waved through.
    console.error('Couldn’t check for the list of signed-in browsers:', (e as Error).message);
    return true;
  }
  g2.__studioSessionsListed = { at: Date.now(), listed };
  return listed;
}

/**
 * Records a new signed-in browser and returns its id; null before the setup
 * file (0007), when cookies carry no id as before. If it can't be recorded,
 * signing in fails rather than handing out a cookie nobody could sign out.
 */
export async function openSession(personId: UserId, userAgent: string | null, via: string): Promise<string | null> {
  const repo = getRepo();
  try {
    if ((await repo.listSessions(personId)) === null) return null;
    const at = new Date().toISOString();
    const rec: SessionRecord = { id: newSid(), personId, createdAt: at, lastSeenAt: at, device: deviceOf(userAgent), via };
    await repo.saveSession(rec);
    remember(rec.id, rec);
    return rec.id;
  } catch (e) {
    console.error('Couldn’t record the signed-in browser:', (e as Error).message);
    throw new HttpError(503, 'Signing in didn’t go through just now. Try again in a minute.');
  }
}

function remember(sid: string, rec: SessionRecord | null) {
  if (seen.size > 2000) seen.clear();
  seen.set(sid, { at: Date.now(), rec });
}

/**
 * Whether this browser is still signed in. If the list can't be read, it
 * isn't, for now: the cookie stays, and works again once the list is back.
 * If the database can't be reached at all, that's said instead, so nobody
 * thinks they've been signed out.
 */
export async function sessionAlive(sid: string, personId: UserId): Promise<boolean> {
  const hit = seen.get(sid);
  let rec = hit && Date.now() - hit.at < TTL ? hit.rec : undefined;
  if (rec === undefined) {
    try {
      rec = await getRepo().getSession(sid);
    } catch (e) {
      if (e instanceof DatabaseUnreachable) throw e;
      console.error('Couldn’t check the signed-in browser:', (e as Error).message);
      return false;
    }
    remember(sid, rec);
  }
  if (!rec || rec.personId !== personId) return false;
  if (Date.now() - Date.parse(rec.lastSeenAt) > TOUCH) {
    const at = new Date().toISOString();
    remember(sid, { ...rec, lastSeenAt: at });
    await getRepo()
      .touchSession(sid, at)
      .catch((e) => console.error('Couldn’t note the browser was used:', (e as Error).message));
  }
  return true;
}

export interface Device {
  id: string;
  device: string;
  via: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** Where you're signed in, most recently used first; null before the setup file (0007). */
export async function devicesOf(user: User, current?: string): Promise<Device[] | null> {
  const list = await getRepo().listSessions(user.id);
  return list?.map((s) => ({ id: s.id, device: s.device, via: s.via, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === current })) ?? null;
}

/** Signs one of your browsers out. */
export async function signOutDevice(user: User, sid: unknown): Promise<void> {
  const rec = typeof sid === 'string' && /^[a-z0-9]{16}$/.test(sid) ? await getRepo().getSession(sid) : null;
  if (!rec || rec.personId !== user.id) throw new HttpError(404, 'That one’s signed out already.');
  await getRepo().deleteSession(rec.id);
  remember(rec.id, null);
}

/**
 * Signs you out everywhere except `keep` (this browser): every listed browser,
 * and any cookie from before the list. Returns the time to give this
 * browser's fresh cookie, so it isn't cut off with the rest.
 */
export async function signOutEverywhere(user: User, keep?: string): Promise<number> {
  if (!(await directoryStored())) throw new HttpError(503, 'This needs households set up first (0006_households.sql, on the Setup page).');
  const person = await personById(user.id);
  if (!person) throw new HttpError(404, 'You’re not in the directory any more.');
  const now = Math.floor(Date.now() / 1000) * 1000;
  const repo = getRepo();
  await repo.savePerson({ ...person, signedOutAt: new Date(now).toISOString() });
  forgetDirectory();
  for (const s of (await repo.listSessions(user.id)) ?? []) {
    if (s.id === keep) continue;
    await repo.deleteSession(s.id);
    remember(s.id, null);
  }
  return now;
}

/**
 * Ends every browser someone is signed in on, and any cookie of theirs from
 * before now: for someone who no longer belongs to any household, so a
 * cookie left on a shared or stolen phone doesn't come back to life if
 * they're invited back.
 */
export async function endAllSessions(personId: UserId, at = Date.now()): Promise<void> {
  const repo = getRepo();
  const person = await personById(personId);
  if (person) await repo.savePerson({ ...person, signedOutAt: new Date(Math.floor(at / 1000) * 1000).toISOString() });
  await repo.deleteSessionsOf(personId);
  for (const [sid, hit] of seen) if (hit.rec?.personId === personId) remember(sid, null);
  forgetDirectory();
}

/** Signing out on this browser: off the list too, so a copy of its cookie is no good either. */
export async function endSession(sid: string): Promise<void> {
  remember(sid, null);
  await getRepo()
    .deleteSession(sid)
    .catch((e) => console.error('Couldn’t take the browser off the list:', (e as Error).message));
}
