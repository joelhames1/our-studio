// Invites: the only way anyone new gets in. A household's owner invites
// someone into it; whoever runs the site invites someone to start a household
// of their own. Either way it's a link with a secret after the # (so it never
// reaches a server log), good for one person, for a week. Only a hash of the
// secret is stored.
//
// Opening the link shows who it's from and asks the person's name. Someone
// already signed in joins with one tap; anyone else signs in with Google or an
// emailed code, and the invite (held for half an hour in a cookie only the
// sign-in routes see) adds them as they arrive.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Invite, Person, User } from '@/lib/engine/types';
import { record } from './activity';
import { ADMIN } from './auth';
import { config } from './config';
import { HttpError } from './errors';
import { newId } from './ids';
import { rateLimit } from './limits';
import { cleanName, forgetDirectory, getHousehold, nameOf, personByEmail, userById } from './people';
import { getRepo } from './repo';

export const INVITE_DAYS = 7;
export const INVITE_COOKIE = 'studio_invite';
/** How long an opened invite waits for its person to finish signing in. */
const HOLD_MINUTES = 30;
/** Open invites a household can have at once. */
const MAX_OPEN = 20;
const TOKEN = /^[\w-]{43}$/;

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
const isOpen = (i: Invite, now = new Date().toISOString()) => !i.usedAt && i.expiresAt > now;

/** What the person opening an invite is told. */
export interface InviteView {
  kind: Invite['kind'];
  /** Who sent it. */
  from: string;
  /** The household they'd join, or the name the new one starts with. */
  household: string;
  /** Who it's for, as the sender put it. */
  name: string;
  expiresAt: string;
}

/** The setup file has to be run first; this says so. */
async function invitesTable(): Promise<Invite[]> {
  const all = await getRepo().listInvites();
  if (!all) throw new HttpError(503, 'Invites need one setup step: run supabase/migrations/0007_invites_and_sessions.sql in Supabase’s SQL Editor (it’s on the Setup page).');
  return all;
}

/**
 * A new invite and its link. A household's owner invites people into it;
 * only whoever runs the site can invite someone to start a new household.
 */
export async function createInvite(user: User, input: { kind?: unknown; name?: unknown; household?: unknown }, origin: string): Promise<{ invite: Invite; link: string }> {
  const kind = input.kind === 'household' ? 'household' : 'member';
  if (kind === 'household' && !user.admin) throw new HttpError(403, 'Only whoever runs the site can invite a new household.');
  if (kind === 'member' && user.role !== 'owner') throw new HttpError(403, 'Only the household’s owner can invite people.');
  const name = cleanName(input.name);
  if (!name) throw new HttpError(400, 'Who’s it for? Put their name.');
  const householdName = kind === 'household' ? cleanName(input.household, 60) || `${name}’s household` : undefined;
  if (!(await getHousehold(user.household)) && kind === 'member') throw new HttpError(404, 'That household is gone.');

  const now = new Date();
  const householdId = kind === 'household' ? newId() : user.household;
  const open = (await invitesTable()).filter((i) => isOpen(i, now.toISOString()) && (kind === 'household' ? i.kind === 'household' : i.householdId === householdId));
  if (open.length >= MAX_OPEN) throw new HttpError(429, `There are already ${MAX_OPEN} invites waiting. Cancel some you don’t need first.`);
  await rateLimit(user, 'invite');

  const token = randomBytes(32).toString('base64url');
  const invite: Invite = {
    id: hashOf(token),
    kind,
    householdId,
    ...(householdName ? { householdName } : {}),
    name,
    createdBy: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  await getRepo().saveInvite(invite);
  await record(user, 'invited', { detail: kind === 'household' ? `${name} to start ${householdName}` : name });
  return { invite, link: `${origin}/join#${token}` };
}

/** Invites still waiting to be used: into your household (for its owner), or to start one (for whoever runs the site). */
export async function openInvites(user: User, kind: Invite['kind'] = 'member'): Promise<Invite[] | null> {
  const all = await getRepo().listInvites();
  if (!all) return null;
  if (kind === 'household') return user.admin ? all.filter((i) => i.kind === 'household' && isOpen(i)) : [];
  return user.role === 'owner' ? all.filter((i) => i.kind === 'member' && i.householdId === user.household && isOpen(i)) : [];
}

/** Takes back an invite nobody has used yet. */
export async function cancelInvite(user: User, id: unknown): Promise<void> {
  const invite = typeof id === 'string' && /^[0-9a-f]{64}$/.test(id) ? await getRepo().getInvite(id) : null;
  if (!invite) throw new HttpError(404, 'That invite is gone already.');
  const allowed = invite.kind === 'household' ? user.admin : user.role === 'owner' && invite.householdId === user.household;
  if (!allowed) throw new HttpError(404, 'That invite is gone already.');
  if (invite.usedAt) throw new HttpError(409, `${invite.name} has already used it.`);
  await getRepo().deleteInvite(invite.id);
  await record(user, 'invite-cancelled', { detail: invite.name });
}

/** The invite behind a link's secret, if it can still be used; otherwise why not, as an HttpError. */
export async function findInvite(token: unknown): Promise<{ invite: Invite; view: InviteView }> {
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new HttpError(404, 'That invite link isn’t complete. Copy the whole link from the message and try again.');
  await invitesTable();
  const invite = await getRepo().getInvite(hashOf(token));
  if (!invite) throw new HttpError(404, 'That invite isn’t one we know. It may have been cancelled; ask whoever sent it for a new one.');
  if (invite.usedAt) throw new HttpError(410, 'That invite has already been used. Ask whoever sent it for a new one.');
  if (invite.expiresAt <= new Date().toISOString()) throw new HttpError(410, `That invite has run out (they last ${INVITE_DAYS} days). Ask whoever sent it for a new one.`);
  const household = invite.kind === 'member' ? await getHousehold(invite.householdId) : null;
  if (invite.kind === 'member' && !household) throw new HttpError(410, 'The household that invite was for is gone.');
  return {
    invite,
    view: { kind: invite.kind, from: await nameOf(invite.createdBy), household: household?.name ?? invite.householdName ?? 'a new household', name: invite.name, expiresAt: invite.expiresAt },
  };
}

/**
 * Uses an invite: for whoever's signed in, or for the person who just proved
 * an address by signing in (added as someone new if it's not one we know).
 * Returns them as the app now sees them, working in the household they joined.
 */
export async function acceptInvite(token: unknown, who: { user: User } | { email: string; name?: string }): Promise<User> {
  const { invite, view } = await findInvite(token);
  const repo = getRepo();
  const existing = 'user' in who ? who.user : await personByEmail(who.email);
  const personId = existing?.id ?? newId();
  const archived = existing && !('user' in who) ? (existing as Person) : null;
  if (archived?.archivedWhy === 'switched-off') throw new HttpError(403, `That account has been switched off. Ask ${ADMIN.name}, who runs the site.`);
  if (existing && invite.kind === 'member') {
    const user = await userById(existing.id, invite.householdId);
    // Already in: nothing to do, and the invite stays free for someone else.
    if (user?.households.includes(invite.householdId)) return user;
  }

  const at = new Date().toISOString();
  if (!(await repo.claimInvite(invite, personId, at))) throw new HttpError(410, 'That invite has just been used. Ask whoever sent it for a new one.');
  if (!existing && !('user' in who)) {
    const email = who.email.trim().toLowerCase();
    await repo.savePerson({ id: personId, name: cleanName(who.name) || invite.name, email, createdAt: at });
  }
  if (archived?.archivedAt) {
    // They closed their account and someone's asked them back: it opens again, with what was theirs.
    // The other households they were in stay ended; those need their own invites.
    const { archivedAt: _a, archivedBy: _b, archivedWhy: _w, eraseAfter: _e, ...open } = archived;
    await repo.savePerson(open);
  }
  if (invite.kind === 'household') {
    await repo.saveHousehold({ id: invite.householdId, name: invite.householdName ?? view.household, createdAt: at, createdBy: personId });
  }
  await repo.saveMembership({ householdId: invite.householdId, personId, role: invite.kind === 'household' ? 'owner' : 'member', joinedAt: at });
  forgetDirectory();
  const user = await userById(personId, invite.householdId);
  if (!user) throw new HttpError(500, 'Joining didn’t take. Try the link again.');
  await record(user, 'joined', { detail: invite.kind === 'household' ? 'and started it' : `invited by ${view.from}` });
  return user;
}

/** The cookie that holds an opened invite (and the name the person gave) while they sign in. Only the sign-in routes see it. */
export function inviteCookie(token: string, name = '') {
  return {
    name: INVITE_COOKIE,
    value: token ? `${token}.${Buffer.from(cleanName(name)).toString('base64url')}` : '',
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: token ? HOLD_MINUTES * 60 : 0,
  };
}

/** What `inviteCookie` holds, or null if it holds nothing usable. */
export function readInviteCookie(value: unknown): { token: string; name: string } | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const [token, name = ''] = value.split('.');
  if (!TOKEN.test(token) || !/^[\w-]*$/.test(name)) return null;
  return { token, name: cleanName(Buffer.from(name, 'base64url').toString('utf8')) };
}

/**
 * For the sign-in routes: if this browser opened an invite, the person who
 * just proved `email` uses it. Null when there's no invite waiting; 'gone'
 * when there was one but it can't be used now.
 */
export async function joinOnSignIn(cookie: unknown, email: string): Promise<User | 'gone' | 'switched-off' | null> {
  const held = readInviteCookie(cookie);
  if (!held) return null;
  try {
    return await acceptInvite(held.token, { email, name: held.name });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 410)) return 'gone';
    if (e instanceof HttpError && e.status === 403) return 'switched-off';
    throw e;
  }
}

/** Whether this browser holds an invite that can still be used (so an email code may go to an address we don't know yet). */
export async function holdsInvite(cookie: unknown): Promise<boolean> {
  const held = readInviteCookie(cookie);
  if (!held) return false;
  return findInvite(held.token).then(
    () => true,
    () => false,
  );
}

/** A request's cookie by name, for routes that get a plain Request. Values here need no decoding. */
export function cookieFrom(req: Request, name: string): string | undefined {
  return req.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
