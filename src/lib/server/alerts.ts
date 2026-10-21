// An email to whoever runs the site when something breaks on the server, sent
// through Resend. One an hour for each problem, and a few at most for each
// kind, so a bad afternoon is a handful of emails rather than a hundred (the
// rest are in Vercel's logs), and one noisy problem can't hide a different one.
// Off until RESEND_API_KEY and an address (ALERT_EMAIL or CONTACT_EMAIL) are
// set, and it never gets in the way: if an alert can't be sent, the request
// that failed carries on failing exactly as it would have.
import 'server-only';
import { createHash } from 'node:crypto';
import { config } from './config';
import { sendEmail } from './email';
import { getRepo } from './repo';

export type AlertKind = 'server' | 'ai' | 'backup' | 'test';

const SUBJECTS: Record<AlertKind, string> = {
  server: 'something broke on the server',
  ai: 'an AI service isn’t answering',
  backup: 'last night’s backup didn’t work',
  test: 'a test alert',
};

const HOUR = 3_600_000;
/** Different problems of one kind emailed in an hour; past that, the rest are only in the logs. */
const PER_KIND = 3;
/** Counts this server keeps itself, for when the shared counters can't be reached. */
const countedHere = new Map<string, { n: number; at: number }>();

/**
 * Nothing private in an email: printer-link tokens, email addresses, and long
 * ids (which can carry a project's name) are blanked out. Vercel's logs have
 * the rest for whoever needs it.
 */
export function redact(line: string): string {
  return line
    .replace(/\/s\/[^/\s)]+/g, '/s/…')
    .replace(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/[A-Za-z0-9_-]{20,}/g, (m) => (/\d/.test(m) ? '…' : m));
}

/** Which problem this is: the same words, give or take numbers and ids, is the same problem. */
const problemOf = (lines: string[]) =>
  createHash('sha256')
    .update(lines.map(redact).join('\n').replace(/\d+/g, '#'))
    .digest('hex')
    .slice(0, 16);

/** How long to wait for the shared counters before going by this server's memory: the database may be the very thing that's down. */
const COUNTER_WAIT_MS = 1_500;

async function count(key: string, until: number, now: number): Promise<number> {
  try {
    const shared = getRepo().hit(key, new Date(until));
    // If it answers after we've stopped waiting, that's fine: nothing to catch.
    shared.catch(() => {});
    const n = await Promise.race([shared, new Promise<null>((r) => setTimeout(() => r(null), COUNTER_WAIT_MS).unref?.())]);
    if (n !== null) return n;
  } catch {
    // Fall through to this server's own memory.
  }
  for (const [k, v] of countedHere) if (now - v.at > HOUR) countedHere.delete(k);
  const n = (countedHere.get(key)?.n ?? 0) + 1;
  countedHere.set(key, { n, at: now });
  return n;
}

/** Whether to email this one: the first of its problem this hour, and within the hour's few for its kind (counted in the database, so it holds across servers). */
async function worthSending(kind: AlertKind, lines: string[], now: number): Promise<boolean> {
  const start = Math.floor(now / HOUR) * HOUR;
  if ((await count(`alert|${kind}|${problemOf(lines)}|${start}`, start + HOUR, now)) !== 1) return false;
  return (await count(`alert|${kind}|${start}`, start + HOUR, now)) <= PER_KIND;
}

/** Sends one alert, or says why it couldn't. */
async function deliver(kind: AlertKind, lines: string[], now: number): Promise<void> {
  const text = [
    ...lines.map((l) => redact(l.slice(0, 500))),
    '',
    `When: ${new Date(now).toISOString()}`,
    kind === 'test' ? 'If you can read this, alerts work.' : `There’s more in Vercel → Logs. You’ll get one of these an hour for each problem, and at most ${PER_KIND} an hour like it.`,
  ].join('\n');
  await sendEmail({ to: config.alertEmail!, subject: `Our Studio: ${SUBJECTS[kind]}`, text });
}

/**
 * Emails an alert, unless the same problem already went out this hour (or
 * enough of its kind did). `lines` is what happened, kept short: where and the
 * error message, never what anyone typed. Resolves to whether an email went
 * out; never throws.
 */
export async function sendAlert(kind: Exclude<AlertKind, 'test'>, lines: string[], now = Date.now()): Promise<boolean> {
  if (!config.alertsOn) return false;
  try {
    if (!(await worthSending(kind, lines, now))) return false;
    await deliver(kind, lines, now);
    return true;
  } catch (e) {
    console.error('Couldn’t send an alert email:', (e as Error).message);
    return false;
  }
}

/** Setup's "Send a test": goes out every time, and says what went wrong if it can't. */
export async function sendTestAlert(): Promise<string> {
  if (!config.resendKey) throw new Error('No RESEND_API_KEY set.');
  if (!config.alertEmail) throw new Error('No address to send to: set ALERT_EMAIL (or CONTACT_EMAIL).');
  await deliver('test', ['This is the test you asked for from Setup.'], Date.now());
  return `Sent to ${config.alertEmail}. It can take a minute to arrive; check spam the first time.`;
}
