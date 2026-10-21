// Agreeing to how Our Studio uses AI. Each person says OK once, on the welcome
// screen, before anything they type is sent to Claude or the artwork service.
// The agreement is an entry in the activity log ("Erin agreed to how Our Studio
// uses AI"), so it has a date and stays on record. Changing what's sent, in a
// way people should hear about, means bumping VERSION: everyone is asked again.
import 'server-only';
import type { User } from '@/lib/engine/types';
import { record } from './activity';
import { HttpError } from './auth';
import { rateLimit, type LimitKind } from './limits';
import { getRepo, SetupNeeded } from './repo';

export const CONSENT_VERSION = 1;
const DETAIL = `how Our Studio uses AI (version ${CONSENT_VERSION})`;

/** People known to have agreed to this version, on this server. Agreeing can't be undone here, so a yes never goes stale. */
const agreed = new Set<string>();

/** Whether `user` has agreed to the current version. */
export async function hasAgreed(user: User): Promise<boolean> {
  if (agreed.has(user.id)) return true;
  let entries;
  try {
    entries = await getRepo().listActivity({ by: user.id, action: 'agreed', limit: 20 });
  } catch (e) {
    // With no database, or before the activity log's table exists, there's
    // nowhere to keep an agreement, and asking would only loop. Setup flags both.
    if (e instanceof SetupNeeded) return true;
    throw e;
  }
  if (!entries.some((e) => e.detail === DETAIL)) return false;
  agreed.add(user.id);
  return true;
}

/** Records that `user` agrees, from the welcome screen. */
export async function agree(user: User): Promise<void> {
  if (await hasAgreed(user)) return;
  await record(user, 'agreed', { detail: DETAIL });
  agreed.add(user.id);
}

/**
 * Every request that sends something to an AI service comes through here:
 * refused until the person has agreed, then counted against their limits.
 */
export async function beforeAI(user: User, kind: LimitKind): Promise<void> {
  if (!(await hasAgreed(user))) throw new HttpError(403, 'Please agree to how Our Studio uses AI first: reload the page to see it.');
  await rateLimit(user, kind);
}
