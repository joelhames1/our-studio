// An email to whoever runs the site when something breaks on the server, sent
// through Resend. At most one an hour for each kind of problem, so a bad
// afternoon is one email rather than a hundred; the rest are in Vercel's logs.
// Off until RESEND_API_KEY and an address (ALERT_EMAIL or CONTACT_EMAIL) are
// set, and it never gets in the way: if an alert can't be sent, the request
// that failed carries on failing exactly as it would have.
import 'server-only';
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
/** Kinds already alerted this hour on this server, for when the shared counters can't be reached. */
const sentHere = new Map<string, number>();

/** Whether this is the first alert of its kind this hour (counted in the database, so it holds across servers). */
async function firstThisHour(kind: AlertKind, now: number): Promise<boolean> {
  const start = Math.floor(now / HOUR) * HOUR;
  const key = `alert|${kind}|${start}`;
  try {
    const n = await getRepo().hit(key, new Date(start + HOUR));
    if (n !== null) return n === 1;
  } catch {
    // Fall through to this server's own memory.
  }
  if (sentHere.get(key)) return false;
  sentHere.set(key, now);
  for (const [k, t] of sentHere) if (now - t > HOUR) sentHere.delete(k);
  return true;
}

/** Sends one alert, or says why it couldn't. */
async function deliver(kind: AlertKind, lines: string[], now: number): Promise<void> {
  const text = [
    ...lines.map((l) => l.slice(0, 500)),
    '',
    `When: ${new Date(now).toISOString()}`,
    kind === 'test' ? 'If you can read this, alerts work.' : 'There’s more in Vercel → Logs. You’ll get at most one of these an hour for each kind of problem.',
  ].join('\n');
  await sendEmail({ to: config.alertEmail!, subject: `Our Studio: ${SUBJECTS[kind]}`, text });
}

/**
 * Emails an alert, unless one of the same kind went out this hour. `lines` is
 * what happened, kept short: where and the error message, never what anyone
 * typed. Resolves to whether an email went out; never throws.
 */
export async function sendAlert(kind: Exclude<AlertKind, 'test'>, lines: string[], now = Date.now()): Promise<boolean> {
  if (!config.alertsOn) return false;
  try {
    if (!(await firstThisHour(kind, now))) return false;
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
