// "Email me a code", for anyone without a Google account (and, later, for
// invites sent by email). Type the address you were invited with, get six
// digits by email, type them here within 10 minutes. The same signed session
// as Google at the end (auth.ts).
//
// The server keeps no codes. The browser that asked holds a short-lived cookie
// with the address, when it runs out, and a signature over those and the code,
// so only that browser, with the code from the email, can finish. The database
// only counts, so the form can't be turned into a way to spam people or lock
// them out: codes to each address from each network (5 an hour, 10 a day), to
// each address from anywhere (30 a day), from each network (20 an hour, 60 a
// day), on each invite (5), and across the whole site (CODE_EMAILS_PER_DAY, 100
// by default); and wrong tries at each code (5). If those counters can't be
// reached, codes stop rather than go uncounted.
//
// Every address gets the same answer, "if it's on the list, a code is on its
// way", so the form can't be used to find out who's invited.
import 'server-only';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import type { User } from '@/lib/engine/types';
import { HttpError, userForEmail } from './auth';
import { heldInvite, joinOnSignIn } from './invites';
import { config } from './config';
import { cookieName } from './cookies';
import { sendEmail } from './email';
import { howLong } from './limits';
import { getRepo } from './repo';
import { sameSecret } from './session';

export const CODE_COOKIE = cookieName('studio_code');
export const CODE_MINUTES = 10;
export const MAX_TRIES = 5;
/** [window in seconds, most codes in it]: to one address from one network, from one network, to one address from anywhere. */
const PER_ADDRESS_AND_NETWORK: [number, number][] = [
  [3600, 5],
  [24 * 3600, 10],
];
const PER_NETWORK: [number, number][] = [
  [3600, 20],
  [24 * 3600, 60],
];
const PER_ADDRESS: [number, number][] = [[24 * 3600, 30]];
/** Codes one invite can send, to whatever addresses, while it lasts. */
const PER_INVITE = 5;

const sha = (s: string) => createHash('sha256').update(s).digest();
/** A plain address and nothing else: no names, angle brackets, commas or quotes for a mail service to read more into. */
const looksLikeEmail = (v: string) => v.length <= 254 && /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v);

/** Counts one in every window of a limit, and says how long to wait if any is full. */
async function within(prefix: string, windows: [number, number][], now: number, message: (wait: string) => string): Promise<void> {
  for (const [seconds, max] of windows) {
    const start = Math.floor(now / 1000 / seconds) * seconds;
    const ends = (start + seconds) * 1000;
    if ((await count(`${prefix}|${seconds}|${start}`, ends)) > max) throw new HttpError(429, message(howLong((ends - now) / 1000)));
  }
}

/** The signature that ties a code to one address, one browser and one expiry. */
function sign(nonce: string, email: string, exp: number, code: string): string {
  const key = sha(`studio-code|${config.serverSecret}`);
  return createHmac('sha256', key).update(`${nonce}|${email}|${exp}|${code}`).digest('base64url');
}

/** Counts one in the shared counters, or stops: codes never go uncounted. */
async function count(key: string, until: number): Promise<number> {
  let n: number | null = null;
  try {
    n = await getRepo().hit(key, new Date(until));
  } catch (e) {
    console.error('Email codes: counting failed:', (e as Error).message);
  }
  if (n === null) throw new HttpError(503, 'Email codes aren’t working right now. Use Google, or try again in a few minutes.');
  return n;
}

function codeEmail(code: string) {
  const text = [
    `Your Our Studio code is ${code}`,
    '',
    `Type it on the sign-in screen within ${CODE_MINUTES} minutes. It only works in the browser where you asked for it.`,
    '',
    'Didn’t ask for a code? Ignore this email. Nobody can sign in without it.',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1d2a33">
<p style="font-size:16px;margin:0 0 16px">Your Our Studio code is</p>
<p style="font-size:34px;font-weight:600;letter-spacing:6px;margin:0 0 20px">${code}</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Type it on the sign-in screen within ${CODE_MINUTES} minutes. It only works in the browser where you asked for it.</p>
<p style="font-size:13px;color:#6b7780;margin:0">Didn’t ask for a code? Ignore this email. Nobody can sign in without it.</p>
</div>`;
  return { subject: `${code} is your Our Studio code`, text, html };
}

/**
 * Sends a code to this address if it's one of ours, and returns the cookie
 * value that goes with it. Anyone else's address gets a cookie for a code
 * nobody will ever see, after about as long as an email takes, so the two
 * look the same from outside.
 */
export async function sendCode(address: unknown, now = Date.now(), invite?: unknown, network = 'local'): Promise<{ cookie: string; to: string }> {
  if (!config.emailCodes) throw new HttpError(404, 'Email codes aren’t set up.');
  const email = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!looksLikeEmail(email)) throw new HttpError(400, 'That doesn’t look like an email address.');

  // Counted whoever the address belongs to: per network first, so one network can't use up someone else's allowance.
  const tag = sha(email).toString('hex').slice(0, 32);
  const busy = (wait: string) => `That’s a lot of codes. Try again in about ${wait}.`;
  await within(`code-net|${network}`, PER_NETWORK, now, busy);
  await within(`code-send|${tag}|${network}`, PER_ADDRESS_AND_NETWORK, now, (wait) => `That’s a lot of codes for one address. Try again in about ${wait}.`);
  await within(`code-addr|${tag}`, PER_ADDRESS, now, (wait) => `That’s a lot of codes for one address. Try again in about ${wait}.`);

  // Someone holding an invite can get a code at an address we don't know yet: that's how they arrive. A few per invite, not a mailing list.
  const known = await userForEmail(email);
  const held = known ? null : await heldInvite(invite);
  if (held && (await count(`code-invite|${held.id}`, Date.parse(held.expiresAt))) > PER_INVITE) {
    throw new HttpError(429, 'That invite has sent all the codes it can. Ask whoever sent it for a new one.');
  }
  const who = known ?? held;
  if (who) {
    const day = Math.floor(now / 86_400_000);
    if ((await count(`code-all|${day}`, (day + 1) * 86_400_000)) > config.codeEmailsPerDay) {
      throw new HttpError(503, 'Email codes are resting until tomorrow. Use Google, or try again later.');
    }
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const nonce = randomBytes(16).toString('base64url');
  const exp = Math.floor(now / 1000) + CODE_MINUTES * 60;
  if (who) {
    try {
      await sendEmail({ to: email, ...codeEmail(code) });
    } catch (e) {
      console.error('Email codes: sending failed:', (e as Error).message);
      throw new HttpError(502, 'The email didn’t go out. Try again in a minute, or use Google.');
    }
  } else {
    await new Promise((r) => setTimeout(r, 250 + randomInt(400)));
  }
  const cookie = [nonce, Buffer.from(email).toString('base64url'), exp, sign(nonce, email, exp, code)].join('.');
  return { cookie, to: email };
}

/** Who a code signs in, given the cookie from `sendCode`; or why not, as an HttpError. */
export async function checkCode(cookie: unknown, typed: unknown, now = Date.now(), invite?: unknown): Promise<User> {
  if (!config.emailCodes) throw new HttpError(404, 'Email codes aren’t set up.');
  const parts = typeof cookie === 'string' && cookie.length <= 600 ? cookie.split('.') : [];
  const [nonce, emailB64, expS, mac] = parts;
  if (parts.length !== 4 || !/^[\w-]{22}$/.test(nonce) || !/^\d{1,12}$/.test(expS)) {
    throw new HttpError(400, 'This browser doesn’t have a code waiting. Ask for a new one.');
  }
  const exp = Number(expS);
  if (exp * 1000 <= now) throw new HttpError(410, `That code has run out (they last ${CODE_MINUTES} minutes). Ask for a new one.`);
  // No code lasts longer than this; a later time is made up, and isn't worth counting tries for.
  if (exp * 1000 > now + (CODE_MINUTES + 1) * 60_000) throw new HttpError(400, 'This browser doesn’t have a code waiting. Ask for a new one.');
  const code = typeof typed === 'string' ? typed.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'The code is the six digits in the email.');

  const tries = await count(`code-try|${nonce}`, exp * 1000);
  if (tries > MAX_TRIES) throw new HttpError(429, 'Too many wrong tries for that code. Ask for a new one.');
  const email = Buffer.from(emailB64, 'base64url').toString('utf8');
  const wrong = () => {
    const left = MAX_TRIES - tries;
    return new HttpError(401, left > 0 ? `That code isn’t right. ${left === 1 ? 'One more try' : `${left} more tries`}.` : 'That code isn’t right. Ask for a new one.');
  };
  if (!sameSecret(mac, sign(nonce, email, exp, code))) throw wrong();
  if ((await count(`code-used|${nonce}`, exp * 1000)) > 1) throw new HttpError(401, 'That code has already been used. Ask for a new one.');
  // The address is proved now, so an invite this browser opened can add them.
  const joined = await joinOnSignIn(invite, email);
  if (joined === 'switched-off') throw new HttpError(403, 'That account has been switched off. Ask whoever runs the site.');
  if (joined && joined !== 'gone') return joined;
  const who = await userForEmail(email);
  if (!who) {
    if (joined === 'gone') throw new HttpError(410, 'That invite can’t be used any more: it’s been used, cancelled or has run out. Ask whoever sent it for a new one.');
    throw wrong();
  }
  return who;
}

/** The cookie that holds a code's signature while you fetch the email. Only the code routes read it; SameSite=Strict keeps it off other sites' requests. */
export function codeCookie(value: string) {
  return {
    name: CODE_COOKIE,
    value,
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: value ? CODE_MINUTES * 60 : 0,
  };
}
