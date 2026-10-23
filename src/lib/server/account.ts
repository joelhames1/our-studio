// Closing, switching off, restoring and erasing accounts. Three tiers, gentlest first:
//
// 1. Leaving a household, or being taken out of one (membership.ts): the
//    membership is marked ended. Invite them back and they return.
// 2. An archived account: closed by its owner, or switched off by whoever runs
//    the site. They're signed out everywhere, can't sign in, and drop out of
//    every household, but everything's kept and their name stays on what they
//    did. Joel can restore either; an invite also brings back someone who
//    closed their own account (not one he switched off).
// 3. Erased for good: the person, their hearts, sign-ins and devices, and any
//    household nobody's left in, with its projects and files. Only Joel can
//    erase on the spot (an archived account, or a household nobody's in).
//    Someone closing their own account can ask for it, and it happens 30 days
//    later in the nightly job, which Joel can stop until then.
//
// What people made with others (projects, designs, approvals) always stays
// with the household. Joel's own account can't be closed or erased.
import 'server-only';
import type { HouseholdId, Person, User, UserId } from '@/lib/engine/types';
import { record } from './activity';
import { eraseProjects } from './archive';
import { ADMIN } from './auth';
import { HttpError } from './errors';
import { endMembership, handOver } from './membership';
import { directoryStored, everyone, forgetDirectory, membersOf, personById } from './people';
import { listPrinters } from './printers';
import { getRepo } from './repo';
import { householdOf } from './studio';

/** What you type to close your account. */
export const CLOSE_WORD = 'close';
/** How long after asking a closed account's data is erased. */
export const ERASE_DAYS = 30;

async function stored() {
  if (!(await directoryStored())) throw new HttpError(503, `Accounts can’t be closed until households are set up. Ask ${ADMIN.name}.`);
}

function mustRunSite(user: User) {
  if (!user.admin) throw new HttpError(403, 'Only whoever runs the site can do that.');
}

async function archivable(id: unknown): Promise<Person> {
  const person = typeof id === 'string' ? await personById(id) : null;
  if (!person) throw new HttpError(404, 'There’s nobody by that id.');
  if (person.siteAdmin) throw new HttpError(403, 'Whoever runs the site keeps their account.');
  return person;
}

/** The app's idea of someone for writing a log entry in a particular household. */
const asIn = (p: Pick<Person, 'id' | 'name'>, household: HouseholdId, admin = false): User => ({
  id: p.id,
  name: p.name,
  admin,
  household,
  role: 'member',
  households: [household],
  roles: { [household]: 'member' },
});

/**
 * Archives someone: in each household they're in, someone else looks after
 * what they had (ownership to whoever joined next if they were the only owner,
 * and the final say on anything unapproved), the log says so, and the
 * membership ends. Then they're signed out everywhere.
 */
async function archive(person: Person, why: 'closed' | 'switched-off', by: User, eraseAfter?: string): Promise<void> {
  const repo = getRepo();
  const at = new Date().toISOString();
  const dir = await everyone();
  const theirs = dir.memberships.filter((m) => m.personId === person.id && !m.endedAt);
  for (const m of theirs) {
    const others = (await membersOf(m.householdId)).filter((x) => x.id !== person.id);
    if (others.length) {
      let owners = others.filter((x) => x.role === 'owner');
      if (!owners.length) {
        const next = others[0];
        await repo.saveMembership({ householdId: m.householdId, personId: next.id, role: 'owner', joinedAt: next.joinedAt });
        owners = [next];
      }
      await handOver(m.householdId, person.id, owners[0].id);
    }
    if (why === 'closed') await record(asIn(person, m.householdId), 'account-closed');
    else await record({ ...by, household: m.householdId }, 'account-switched-off', { detail: person.name });
    await endMembership(m.householdId, { id: person.id, role: m.role, joinedAt: m.joinedAt }, why, by.id, at);
  }
  // Cookies count whole seconds, so the cutoff does too: a sign-in after a restore, even in the same second, still works.
  const cutoff = new Date(Math.floor(Date.parse(at) / 1000) * 1000).toISOString();
  await repo.savePerson({ ...person, archivedAt: at, archivedBy: by.id, archivedWhy: why, signedOutAt: cutoff, ...(eraseAfter ? { eraseAfter } : {}) });
  await repo.deleteSessionsOf(person.id).catch(() => undefined);
  forgetDirectory();
}

/**
 * You close your own account, typing "close" to be sure. With `erase`, your
 * data is erased for good in 30 days; until then it's only closed.
 */
export async function closeAccount(user: User, input: { confirm?: unknown; erase?: unknown }): Promise<{ eraseAfter: string | null }> {
  if (user.admin) throw new HttpError(403, 'You run the site, so your account stays open.');
  if (typeof input.confirm !== 'string' || input.confirm.trim().toLowerCase() !== CLOSE_WORD) throw new HttpError(400, `Type “${CLOSE_WORD}” to close your account.`);
  await stored();
  const person = await archivable(user.id);
  const eraseAfter = input.erase === true ? new Date(Date.now() + ERASE_DAYS * 86_400_000).toISOString() : undefined;
  await archive(person, 'closed', user, eraseAfter);
  return { eraseAfter: eraseAfter ?? null };
}

/** Joel switches someone's account off: as closed, except an invite won't bring them back. */
export async function switchOff(admin: User, personId: unknown): Promise<void> {
  mustRunSite(admin);
  await stored();
  const person = await archivable(personId);
  if (person.archivedAt) throw new HttpError(409, `${person.name}’s account is already ${person.archivedWhy === 'closed' ? 'closed' : 'switched off'}.`);
  await archive(person, 'switched-off', admin);
}

/** Joel brings an archived account back, into the households it was in when it closed. Any erasure planned is off. */
export async function restore(admin: User, personId: unknown): Promise<void> {
  mustRunSite(admin);
  await stored();
  const person = await archivable(personId);
  if (!person.archivedAt) throw new HttpError(409, `${person.name}’s account is open already.`);
  const repo = getRepo();
  const dir = await everyone();
  const households = new Set(dir.households.map((h) => h.id));
  for (const m of dir.memberships) {
    // Only the memberships that ended when the account did, in households that still exist.
    if (m.personId !== person.id || m.endedAt !== person.archivedAt || !households.has(m.householdId)) continue;
    await repo.saveMembership({ householdId: m.householdId, personId: m.personId, role: m.role, joinedAt: m.joinedAt });
    await record({ ...admin, household: m.householdId }, 'account-restored', { detail: person.name });
  }
  const { archivedAt: _a, archivedBy: _b, archivedWhy: _w, eraseAfter: _e, ...open } = person;
  await repo.savePerson(open);
  forgetDirectory();
}

/** Joel stops a planned erasure; the account stays closed. */
export async function keepData(admin: User, personId: unknown): Promise<void> {
  mustRunSite(admin);
  const person = await archivable(personId);
  if (!person.eraseAfter) return;
  const { eraseAfter: _e, ...kept } = person;
  await getRepo().savePerson(kept);
  forgetDirectory();
}

/** Joel erases an archived account now, with its name typed out to be sure. */
export async function eraseNow(admin: User, personId: unknown, confirm: unknown): Promise<void> {
  mustRunSite(admin);
  await stored();
  const person = await archivable(personId);
  if (!person.archivedAt) throw new HttpError(409, `Switch ${person.name}’s account off first. Only a closed or switched-off account can be erased.`);
  if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== person.name.trim().toLowerCase()) throw new HttpError(400, `Type ${person.name}’s name exactly to erase the account.`);
  await erase(person.id);
}

/** Joel erases a household nobody's in any more, with its projects and files, with its name typed out. */
export async function eraseEmptyHousehold(admin: User, householdId: unknown, confirm: unknown): Promise<void> {
  mustRunSite(admin);
  await stored();
  const household = (await everyone()).households.find((h) => h.id === householdId);
  if (!household) throw new HttpError(404, 'That household is gone already.');
  if ((await membersOf(household.id)).length) throw new HttpError(409, 'People are still in that household. Only an empty one can be erased.');
  if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== household.name.trim().toLowerCase()) throw new HttpError(400, 'Type the household’s name exactly to erase it.');
  await eraseHousehold(household.id);
}

/** Erases accounts whose 30 days are up. The nightly job runs this after the backup. */
export async function eraseDue(now = Date.now()): Promise<number> {
  if (!(await directoryStored())) return 0;
  const due = (await everyone()).people.filter((p) => p.archivedAt && p.eraseAfter && Date.parse(p.eraseAfter) <= now && !p.siteAdmin);
  for (const p of due) await erase(p.id);
  return due.length;
}

/** A household and everything in it: projects, designs, files, printers, invites and who was in it. */
async function eraseHousehold(householdId: HouseholdId): Promise<void> {
  const repo = getRepo();
  const projects = (await repo.listProjects()).filter((p) => householdOf(p) === householdId).map((p) => p.id);
  await eraseProjects(projects);
  for (const p of await listPrinters(householdId)) await repo.deletePrinter(p.id);
  for (const i of (await repo.listInvites()) ?? []) if (i.householdId === householdId) await repo.deleteInvite(i.id);
  for (const m of (await everyone()).memberships) if (m.householdId === householdId) await repo.deleteMembership(householdId, m.personId);
  await repo.deleteHousehold(householdId);
  forgetDirectory();
}

/**
 * For good: the person, their hearts, maybes and passes, their sign-ins,
 * agreements and limits in the log, their devices, and every household they
 * were in that nobody's left in. What they made with others stays, and those
 * households' logs say the account was erased.
 */
async function erase(personId: UserId): Promise<void> {
  const repo = getRepo();
  const person = await personById(personId);
  if (!person) return;
  const dir = await everyone();
  const households = [...new Set(dir.memberships.filter((m) => m.personId === personId).map((m) => m.householdId))];
  for (const h of households) {
    // Gone with them only if nobody else could come back to it: no one in it now, and no one whose
    // account closed while they were in it (they kept their data, so their household stays).
    const kept = dir.memberships.some((m) => m.householdId === h && m.personId !== personId && (!m.endedAt || m.ended === 'closed' || m.ended === 'switched-off'));
    if (!kept) {
      await eraseHousehold(h);
      continue;
    }
    await record(asIn(person, h), 'account-deleted', { detail: person.name });
    await repo.deleteMembership(h, personId);
  }
  await repo.deleteReactionsBy(personId);
  await repo.deleteActivityBy(personId, ['signed-in', 'agreed', 'limited']);
  await repo.deleteSessionsOf(personId).catch(() => undefined);
  await repo.deletePerson(personId);
  forgetDirectory();
}

export interface PersonRow {
  id: UserId;
  name: string;
  email: string | null;
  status: 'open' | 'closed' | 'switched-off';
  /** Households they're in now, or (archived) were in when it closed. */
  households: { name: string; role: string }[];
  archivedAt: string | null;
  eraseAfter: string | null;
  lastSeen: string | null;
  admin: boolean;
}

/** Everyone, for All households → People, and households nobody's in any more. */
export async function peopleOverview(admin: User): Promise<{
  people: PersonRow[];
  empty: { id: string; name: string; createdAt: string; projects: number }[];
  ownerless: { id: string; name: string; members: { id: string; name: string }[] }[];
}> {
  mustRunSite(admin);
  const dir = await everyone();
  const names = new Map(dir.households.map((h) => [h.id, h.name]));
  const repo = getRepo();
  const people = await Promise.all(
    dir.people.map(async (p): Promise<PersonRow> => {
      const ms = dir.memberships.filter((m) => m.personId === p.id && names.has(m.householdId) && (p.archivedAt ? m.endedAt === p.archivedAt : !m.endedAt));
      const sessions = await repo.listSessions(p.id).catch(() => null);
      return {
        id: p.id,
        name: p.name,
        email: p.email ?? null,
        status: p.archivedAt ? (p.archivedWhy ?? 'closed') : 'open',
        households: ms.map((m) => ({ name: names.get(m.householdId)!, role: m.role })),
        archivedAt: p.archivedAt ?? null,
        eraseAfter: p.eraseAfter ?? null,
        lastSeen: sessions?.[0]?.lastSeenAt ?? null,
        admin: !!p.siteAdmin,
      };
    }),
  );
  const projects = await repo.listProjects();
  const empty = [];
  const ownerless = [];
  for (const h of dir.households) {
    const members = await membersOf(h.id);
    if (!members.length) empty.push({ id: h.id, name: h.name, createdAt: h.createdAt, projects: projects.filter((p) => householdOf(p) === h.id).length });
    else if (!members.some((m) => m.role === 'owner')) ownerless.push({ id: h.id, name: h.name, members: members.map((m) => ({ id: m.id, name: m.name })) });
  }
  const order = { open: 0, closed: 1, 'switched-off': 1 } as const;
  return { people: people.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)), empty, ownerless };
}
