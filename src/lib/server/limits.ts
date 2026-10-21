// Per-person rate limits on the requests that cost money or a lot of server
// time. The monthly AI budget caps what can be spent; these stop one person (or
// a stolen session) burning through it in an afternoon, and keep a runaway loop
// from hammering the AI services. Counts live in the database, so they hold
// across every server instance.
import 'server-only';
import type { User } from '@/lib/engine/types';
import { record } from './activity';
import { HttpError } from './auth';
import { getRepo } from './repo';

export type LimitKind = 'claude' | 'art' | 'search' | 'build' | 'create' | 'invite';

/** [window in seconds, most requests in it]. Generous for people, tight for scripts. */
export const LIMITS: Record<LimitKind, { what: string; windows: [number, number][] }> = {
  claude: { what: 'requests to Claude', windows: [[10 * 60, 30], [24 * 3600, 200]] },
  art: { what: 'new artwork', windows: [[10 * 60, 6], [24 * 3600, 30]] },
  search: { what: 'printer searches', windows: [[3600, 5], [24 * 3600, 10]] },
  build: { what: 'print-file builds', windows: [[10 * 60, 10], [24 * 3600, 30]] },
  create: { what: 'new projects', windows: [[3600, 10], [24 * 3600, 30]] },
  invite: { what: 'invites', windows: [[3600, 10], [24 * 3600, 30]] },
};

/** "10 minutes", "hour", "day": how long a window is. */
const span = (seconds: number) => {
  if (seconds % 86400 === 0) return seconds === 86400 ? 'day' : `${seconds / 86400} days`;
  if (seconds % 3600 === 0) return seconds === 3600 ? 'hour' : `${seconds / 3600} hours`;
  return `${Math.round(seconds / 60)} minutes`;
};

/** "4 minutes", "an hour": how long until a window ends. */
export const howLong = (seconds: number) => {
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return 'a minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
};

/**
 * Counts one request of this kind for this person, or refuses it (429) when
 * they're over a limit. If the counters aren't set up yet, or can't be reached,
 * nobody is limited: the budget is still the backstop.
 */
export async function rateLimit(user: User, kind: LimitKind, now = Date.now()): Promise<void> {
  const rule = LIMITS[kind];
  const counts = await Promise.all(
    rule.windows.map(async ([seconds, max]) => {
      const start = Math.floor(now / 1000 / seconds) * seconds;
      const ends = (start + seconds) * 1000;
      try {
        const n = await getRepo().hit(`${user.id}|${kind}|${seconds}|${start}`, new Date(ends));
        return { n, max, seconds, left: (ends - now) / 1000 };
      } catch (e) {
        console.error('Rate limit check failed:', (e as Error).message);
        return { n: null, max, seconds, left: 0 };
      }
    }),
  );
  const over = counts.find((c) => c.n !== null && c.n > c.max);
  if (!over) return;
  // Log the first refusal in a window, not every retry after it.
  if (over.n === over.max + 1) await record(user, 'limited', { detail: `${rule.what}: ${over.max} per ${span(over.seconds)}` });
  throw new HttpError(429, `That’s a lot of ${rule.what} in a short while. Try again in about ${howLong(over.left)}.`);
}
