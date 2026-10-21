// Signed sessions. The cookie never holds a secret: it says who you are (a person's id),
// which signed-in browser this is (v2; see sessions.ts), when it was issued and
// when it runs out, signed with a key made from that person's secret (their
// link token, or the server's own key for Google sign-in; see auth.ts). Change
// Erin's token and only Erin's sessions stop working; bump SESSION_VERSION and
// everyone signs in again. Older v1 cookies have no browser id and still work
// until "sign out everywhere" (or they run out).
import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { UserId } from '@/lib/engine/types';

export const SESSION_DAYS = 365;
const PREFIX = 'v1';
const PREFIX_2 = 'v2';
/** A signed-in browser's id. */
export const SESSION_ID = /^[a-z0-9]{16}$/;
const SKEW = 5 * 60; // seconds of clock drift we tolerate on "issued at"

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest();

/** Compares two secrets without leaking how long they are or where they differ. */
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

function sign(payload: string, userId: UserId, linkToken: string, version: string): string {
  const key = sha(`studio-session|${version}|${userId}|${linkToken}`);
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function signSession(userId: UserId, linkToken: string, version: string, now = Date.now(), sid?: string): string {
  const iat = Math.floor(now / 1000);
  const exp = iat + SESSION_DAYS * 86400;
  const payload = sid ? `${PREFIX_2}.${userId}.${sid}.${iat}.${exp}` : `${PREFIX}.${userId}.${iat}.${exp}`;
  return `${payload}.${sign(payload, userId, linkToken, version)}`;
}

/**
 * Who a session cookie belongs to, or null if it's forged, expired, or was
 * signed with a link token that has since changed.
 */
export function verifySession(
  value: string | undefined | null,
  tokenFor: (id: UserId) => string | undefined,
  version: string,
  now = Date.now(),
): UserId | null {
  return readSession(value, tokenFor, version, now)?.id ?? null;
}

/** The same, with which browser it is (v2 cookies) and when it was issued, for the checks in auth.ts. */
export function readSession(
  value: string | undefined | null,
  tokenFor: (id: UserId) => string | undefined,
  version: string,
  now = Date.now(),
): { id: UserId; sid?: string; iat: number } | null {
  if (!value || value.length > 200) return null;
  const parts = value.split('.');
  const v2 = parts[0] === PREFIX_2;
  if (parts.length !== (v2 ? 6 : 5) || (!v2 && parts[0] !== PREFIX)) return null;
  const [, who] = parts;
  const sid = v2 ? parts[2] : undefined;
  const [iatS, expS, sig] = parts.slice(v2 ? 3 : 2);
  if (!/^[a-z0-9-]{1,40}$/.test(who)) return null;
  if (sid !== undefined && !SESSION_ID.test(sid)) return null;
  if (!/^\d{1,12}$/.test(iatS) || !/^\d{1,12}$/.test(expS)) return null;
  const t = Math.floor(now / 1000);
  const iat = Number(iatS);
  const exp = Number(expS);
  if (iat > t + SKEW || exp <= t || exp - iat > SESSION_DAYS * 86400) return null;
  const token = tokenFor(who);
  if (!token) return null;
  return sameSecret(sig, sign(parts.slice(0, -1).join('.'), who, token, version)) ? { id: who, ...(sid ? { sid } : {}), iat } : null;
}
