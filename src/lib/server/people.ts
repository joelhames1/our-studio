// Who's who: everyone who can sign in, the households they belong to, and
// their part in each. Kept in the database (people, households, memberships).
//
// Joel and Erin are the first household. The first time those tables exist
// and are empty, the two of them are added from ERIN_GOOGLE_EMAIL and
// JOEL_GOOGLE_EMAIL, Joel as the household's owner and the person who runs the
// site. While either variable is set, it stays the address for that person.
// Until the setup file is run, the same two are worked out from the variables,
// so nothing changes before then.
//
// Lookups happen on every request, so each server keeps a copy for a few
// seconds; a change made on one server reaches the others within that time.
import 'server-only';
import type { DirectoryData } from './repo/types';
import { FIRST_HOUSEHOLD, type Household, type HouseholdId, type HouseholdRole, type Membership, type Person, type User, type UserId } from '@/lib/engine/types';
import { config } from './config';
import { HttpError } from './errors';
import { oneLine } from './plain';
import { getRepo } from './repo';
import type { Repo } from './repo/types';

export { FIRST_HOUSEHOLD };

/** Joel and Erin, as they were before households: the first household's two people. */
export const FOUNDERS: Record<'erin' | 'joel', User> = {
  erin: { id: 'erin', name: 'Erin', admin: false, household: FIRST_HOUSEHOLD, role: 'member', households: [FIRST_HOUSEHOLD], roles: { [FIRST_HOUSEHOLD]: 'member' } },
  joel: { id: 'joel', name: 'Joel', admin: true, household: FIRST_HOUSEHOLD, role: 'owner', households: [FIRST_HOUSEHOLD], roles: { [FIRST_HOUSEHOLD]: 'owner' } },
};

/** The first household as the variables describe it. */
function founders(t = new Date().toISOString()): DirectoryData {
  const email = { erin: config.erinEmail, joel: config.joelEmail };
  return {
    people: (['joel', 'erin'] as const).map((id) => ({
      id,
      name: FOUNDERS[id].name,
      ...(email[id] ? { email: email[id] } : {}),
      ...(FOUNDERS[id].admin ? { siteAdmin: true } : {}),
      createdAt: t,
    })),
    households: [{ id: FIRST_HOUSEHOLD, name: `${FOUNDERS.joel.name} & ${FOUNDERS.erin.name}`, createdAt: t, createdBy: 'joel' }],
    memberships: (['joel', 'erin'] as const).map((id) => ({ householdId: FIRST_HOUSEHOLD, personId: id, role: FOUNDERS[id].role, joinedAt: t })),
  };
}

interface Directory {
  /** Everyone, archived people too (their names still show on what they did). */
  people: Map<UserId, Person>;
  byEmail: Map<string, Person>;
  households: Map<HouseholdId, Household>;
  /** Each person's current memberships, oldest first. Ended ones aren't here. */
  memberships: Map<UserId, Membership[]>;
  /** Every membership as stored, ended ones included. */
  all: Membership[];
  /** Whether it's in the database (false: worked out from the variables, before the setup file was run). */
  stored: boolean;
}

function index(data: DirectoryData, stored: boolean): Directory {
  const memberships = new Map<UserId, Membership[]>();
  for (const m of [...data.memberships].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))) {
    if (m.endedAt) continue;
    memberships.set(m.personId, [...(memberships.get(m.personId) ?? []), m]);
  }
  return {
    people: new Map(data.people.map((p) => [p.id, p])),
    byEmail: new Map(data.people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p])),
    households: new Map(data.households.map((h) => [h.id, h])),
    memberships,
    all: data.memberships,
    stored,
  };
}

/** Adds the first household to empty tables, and keeps Joel's and Erin's addresses in step with the variables. */
async function settle(repo: Repo, data: DirectoryData): Promise<DirectoryData> {
  if (!data.people.length) {
    const seed = founders();
    await repo.saveHousehold(seed.households[0]);
    for (const p of seed.people) await repo.savePerson(p);
    for (const m of seed.memberships) await repo.saveMembership(m);
    return seed;
  }
  const wanted = { erin: config.erinEmail, joel: config.joelEmail };
  const people = await Promise.all(
    data.people.map(async (p) => {
      const email = wanted[p.id as keyof typeof wanted];
      if (!email || p.email === email) return p;
      const next = { ...p, email };
      try {
        await repo.savePerson(next);
      } catch (e) {
        // Someone else already has that address, say: keep the stored one rather than lock everyone out.
        console.error(`Couldn’t update ${p.name}’s address from the variables:`, (e as Error).message);
        return p;
      }
      return next;
    }),
  );
  return { ...data, people };
}

const TTL = 10_000;
/** After a miss, how long before another one may reload the directory again. */
const MISS_GAP = 2_000;
/**
 * Per storage, so tests that swap the storage never see another's people.
 * Kept on globalThis and keyed by where the storage is, because Next.js can
 * load this module (and the storage's) more than once in one server (a copy
 * per route bundle in dev), and a change made through one copy has to clear
 * them all.
 */
const g = globalThis as typeof globalThis & { __studioDirectories?: Map<string, { at: number; dir: Promise<Directory> }>; __studioDirectoryMiss?: Map<string, number> };
const cache = (g.__studioDirectories ??= new Map());
const misses = (g.__studioDirectoryMiss ??= new Map());

async function load(repo: Repo): Promise<Directory> {
  const data = await repo.loadDirectory();
  return data ? index(await settle(repo, data), true) : index(founders(), false);
}

function directory(): Promise<Directory> {
  const repo = getRepo();
  const hit = cache.get(repo.where);
  if (hit && Date.now() - hit.at < TTL) return hit.dir;
  const dir = load(repo);
  cache.set(repo.where, { at: Date.now(), dir });
  dir.catch(() => cache.delete(repo.where));
  return dir;
}

/**
 * The directory again, straight from storage, after a lookup missed: someone
 * who joined a moment ago on another server isn't in this server's copy yet.
 * At most once every couple of seconds, so a stale cookie can't hammer it.
 */
async function afterMiss(): Promise<Directory> {
  const where = getRepo().where;
  if (Date.now() - (misses.get(where) ?? 0) < MISS_GAP) return directory();
  misses.set(where, Date.now());
  cache.delete(where);
  return directory();
}

/** After a change, so this server sees it straight away. */
export function forgetDirectory() {
  cache.delete(getRepo().where);
}

/**
 * Reads the directory again before a decision that has to be right this
 * second (who's an owner, whether an invite's maker still is), rather than
 * trusting a copy that could be a few seconds old on this server.
 */
export async function refreshDirectory(): Promise<void> {
  forgetDirectory();
  await directory();
}

/** As the app sees them, working in `prefer` if they belong to it, otherwise the household they joined first. */
function userOf(dir: Directory, p: Person, prefer?: string): User | null {
  const mine = dir.memberships.get(p.id) ?? [];
  // Someone who belongs nowhere, or whose account is closed or switched off, can't do anything here.
  if (!mine.length || p.archivedAt) return null;
  const here = mine.find((m) => m.householdId === prefer) ?? mine[0];
  return {
    id: p.id,
    name: p.name,
    admin: !!p.siteAdmin,
    household: here.householdId,
    role: here.role,
    households: mine.map((m) => m.householdId),
    roles: Object.fromEntries(mine.map((m) => [m.householdId, m.role])),
  };
}

/** Whoever has this id, as the app sees them; null if they're unknown or belong to no household. */
export async function userById(id: string, prefer?: string): Promise<User | null> {
  let dir = await directory();
  const known = (d: Directory) => d.people.has(id) && !d.people.get(id)!.archivedAt && (!prefer || !!d.memberships.get(id)?.some((m) => m.householdId === prefer));
  if (!known(dir)) dir = await afterMiss();
  const p = dir.people.get(id);
  return p ? userOf(dir, p, prefer) : null;
}

/** Their stored record (for when sessions were last cut off), whether or not they're in a household. */
export async function personById(id: string): Promise<Person | null> {
  return (await directory()).people.get(id) ?? (await afterMiss()).people.get(id) ?? null;
}

/** Whoever signs in with this address (Google, or an emailed code). */
export async function userByEmail(email: unknown): Promise<User | null> {
  if (typeof email !== 'string') return null;
  const dir = await directory();
  const p = dir.byEmail.get(email.trim().toLowerCase());
  return p ? userOf(dir, p) : null;
}

/** Their stored record by address, whether or not they're in a household (someone who left everything and is invited back). */
export async function personByEmail(email: string): Promise<Person | null> {
  return (await directory()).byEmail.get(email.trim().toLowerCase()) ?? null;
}

/** Whether people and households are in the database yet (0006_households.sql). */
export async function directoryStored(): Promise<boolean> {
  return (await directory()).stored;
}

/** A name someone typed, tidied: one line, at most 40 characters. Empty if there's nothing left. */
export const cleanName = (name: unknown, max = 40): string => oneLine(name, max);

/** People's names by id, for showing who did what. */
export async function names(): Promise<Map<UserId, string>> {
  const dir = await directory();
  return new Map([...dir.people.values()].map((p) => [p.id, p.name]));
}

/** A name to show for someone, even one who's gone. */
export async function nameOf(id: string | undefined): Promise<string> {
  return (id && (await names()).get(id)) || 'Someone';
}

export interface Member {
  id: UserId;
  name: string;
  role: HouseholdRole;
  email?: string;
  joinedAt: string;
}

/** Everyone in a household, the owner first. */
export async function membersOf(householdId: HouseholdId): Promise<Member[]> {
  const dir = await directory();
  const out: Member[] = [];
  for (const [personId, list] of dir.memberships) {
    const m = list.find((x) => x.householdId === householdId);
    const p = dir.people.get(personId);
    if (m && p && !p.archivedAt) out.push({ id: p.id, name: p.name, role: m.role, ...(p.email ? { email: p.email } : {}), joinedAt: m.joinedAt });
  }
  return out.sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.joinedAt.localeCompare(b.joinedAt));
}

export interface PastMember {
  id: UserId;
  name: string;
  email?: string;
  ended: NonNullable<Membership['ended']>;
  endedAt: string;
  /** Whether an invite can bring them back (not if whoever runs the site switched their account off). */
  invitable: boolean;
}

/** People who were in a household and aren't now, most recent first. */
export async function pastMembersOf(householdId: HouseholdId): Promise<PastMember[]> {
  const dir = await directory();
  const current = new Set([...dir.memberships.values()].flat().filter((m) => m.householdId === householdId && !dir.people.get(m.personId)?.archivedAt).map((m) => m.personId));
  const out: PastMember[] = [];
  for (const m of dir.all) {
    const p = dir.people.get(m.personId);
    if (m.householdId !== householdId || !p || current.has(p.id)) continue;
    // Someone whose account was closed while still a member: their membership ended with it.
    const endedAt = m.endedAt ?? p.archivedAt;
    if (!endedAt) continue;
    const ended = m.ended ?? p.archivedWhy ?? 'left';
    out.push({ id: p.id, name: p.name, ...(p.email ? { email: p.email } : {}), ended, endedAt, invitable: p.archivedWhy !== 'switched-off' });
  }
  return out.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/** The whole directory as stored, for whoever runs the site (Setup → People). */
export async function everyone(): Promise<{ people: Person[]; households: Household[]; memberships: Membership[]; stored: boolean }> {
  const dir = await directory();
  return { people: [...dir.people.values()], households: [...dir.households.values()], memberships: dir.all, stored: dir.stored };
}

export async function getHousehold(id: HouseholdId): Promise<Household | null> {
  return (await directory()).households.get(id) ?? null;
}

/** Every household, oldest first, for Setup. */
export async function listHouseholds(): Promise<Household[]> {
  return [...(await directory()).households.values()].sort((a, b) => Number(b.id === FIRST_HOUSEHOLD) - Number(a.id === FIRST_HOUSEHOLD) || a.createdAt.localeCompare(b.createdAt));
}

/** How many households and people there are, for Setup. Null before the setup file is run. */
export async function directoryCounts(): Promise<{ households: number; people: number } | null> {
  const dir = await directory();
  return dir.stored ? { households: dir.households.size, people: [...dir.people.values()].filter((p) => !p.archivedAt).length } : null;
}

/** The owner renames their household. */
export async function renameHousehold(user: User, name: unknown): Promise<Household> {
  if (user.role !== 'owner') throw new HttpError(403, 'Only the household’s owner can rename it.');
  const clean = cleanName(name, 60);
  if (!clean) throw new HttpError(400, 'Give it a name.');
  const dir = await directory();
  if (!dir.stored) throw new HttpError(503, 'Households aren’t set up in the database yet. Run supabase/migrations/0006_households.sql (it’s on the Setup page).');
  const household = dir.households.get(user.household);
  if (!household) throw new HttpError(404, 'That household is gone.');
  const next = { ...household, name: clean };
  await getRepo().saveHousehold(next);
  forgetDirectory();
  return next;
}

/** The most a household's monthly AI budget can be set to, in dollars. */
export const MAX_HOUSEHOLD_BUDGET_USD = 1000;

/**
 * Joel sets what a household may spend on AI a month, or clears it (null) to
 * go back to the default for its kind. Site-wide, since he pays the bills.
 */
export async function setHouseholdBudget(user: User, householdId: unknown, usd: unknown): Promise<Household> {
  if (!user.admin) throw new HttpError(403, 'Only whoever runs the site can change budgets.');
  if (usd !== null && (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0 || usd > MAX_HOUSEHOLD_BUDGET_USD)) {
    throw new HttpError(400, `A budget is between $0 and $${MAX_HOUSEHOLD_BUDGET_USD}.`);
  }
  const dir = await directory();
  if (!dir.stored) throw new HttpError(503, 'Households aren’t set up in the database yet. Run supabase/migrations/0006_households.sql (it’s on the Setup page).');
  const household = typeof householdId === 'string' ? dir.households.get(householdId) : undefined;
  if (!household) throw new HttpError(404, 'That household is gone.');
  const { budgetUsd: _old, ...rest } = household;
  const next: Household = usd === null ? rest : { ...rest, budgetUsd: Math.round(usd * 100) / 100 };
  await getRepo().saveHousehold(next);
  forgetDirectory();
  return next;
}

/** Changes the name everyone sees for you. */
export async function renamePerson(user: User, name: unknown): Promise<Person> {
  const clean = cleanName(name);
  if (!clean) throw new HttpError(400, 'Put the name you’d like everyone to see.');
  const dir = await directory();
  if (!dir.stored) throw new HttpError(503, 'Households aren’t set up in the database yet. Run supabase/migrations/0006_households.sql (it’s on the Setup page).');
  const me = dir.people.get(user.id);
  if (!me) throw new HttpError(404, 'You’re not in the directory any more.');
  const next = { ...me, name: clean };
  await getRepo().savePerson(next);
  forgetDirectory();
  return next;
}

/**
 * Whether to show someone the "New here?" welcome: anyone who arrived by
 * invite, until they say "Got it" or start a project. Joel and Erin were here
 * before invites, so never.
 */
export async function needsWelcome(user: User): Promise<boolean> {
  if (user.id in FOUNDERS) return false;
  const dir = await directory();
  return dir.stored && !dir.people.get(user.id)?.welcomedAt;
}

/** Notes they've seen how it works. Quietly does nothing if there's nothing to note. */
export async function markWelcomed(user: User): Promise<void> {
  if (!(await needsWelcome(user))) return;
  const me = (await directory()).people.get(user.id);
  if (!me) return;
  await getRepo().savePerson({ ...me, welcomedAt: new Date().toISOString() });
  forgetDirectory();
}
