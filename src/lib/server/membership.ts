// Who's in a household and their part in it, changed from the Household page:
// its owners make someone else an owner (or not), take someone out, and
// anyone can leave. A household always keeps at least one owner, and whoever
// runs the site always keeps a household, so nobody locks themselves (or
// Joel) out. When someone goes, the final say on anything not yet approved
// passes to whoever's looking after the household. Nothing's deleted: the
// membership is marked ended, so owners see past members and can invite them
// back, and their hearts count again if they return.
import 'server-only';
import type { HouseholdId, HouseholdRole, User, UserId } from '@/lib/engine/types';
import { record } from './activity';
import { HttpError } from './errors';
import { directoryStored, forgetDirectory, membersOf, personById, type Member } from './people';
import { getRepo } from './repo';
import { approverOf, householdOf, type ShirtProject } from './studio';

async function stored() {
  if (!(await directoryStored())) throw new HttpError(503, 'Households aren’t set up in the database yet. Run supabase/migrations/0006_households.sql (it’s on the Setup page).');
}

function ownerOf(user: User, household: HouseholdId) {
  if (user.roles[household] !== 'owner') throw new HttpError(403, 'Only the household’s owners can change who’s in it.');
}

async function memberOf(household: HouseholdId, personId: unknown): Promise<{ members: Member[]; them: Member }> {
  const members = await membersOf(household);
  const them = members.find((m) => m.id === personId);
  if (!them) throw new HttpError(404, 'They’re not in the household any more.');
  return { members, them };
}

/** An owner makes someone an owner, or makes an owner a member again. There's always at least one owner. */
export async function setRole(user: User, personId: unknown, role: unknown): Promise<void> {
  const household = user.household;
  await stored();
  ownerOf(user, household);
  if (role !== 'owner' && role !== 'member') throw new HttpError(400, 'Owner or member?');
  const { members, them } = await memberOf(household, personId);
  if (them.role === role) return;
  if (role === 'member' && members.filter((m) => m.role === 'owner').length < 2) {
    throw new HttpError(409, `${them.id === user.id ? 'You’re' : `${them.name} is`} the only owner. Make someone else an owner first.`);
  }
  await getRepo().saveMembership({ householdId: household, personId: them.id, role: role as HouseholdRole, joinedAt: them.joinedAt });
  forgetDirectory();
  await record(user, 'role-changed', { detail: `${them.id === user.id ? 'themselves' : them.name} ${role === 'owner' ? 'an owner' : 'a member'}` });
}

/** An owner takes someone else out of the household. Their hearts stop counting; what they made stays. */
export async function removeMember(user: User, personId: unknown): Promise<void> {
  const household = user.household;
  await stored();
  ownerOf(user, household);
  if (personId === user.id) throw new HttpError(400, 'To go yourself, use Leave the household.');
  const { them } = await memberOf(household, personId);
  if ((await personById(them.id))?.siteAdmin) throw new HttpError(403, `${them.name} runs the site, so only they can leave.`);
  await handOver(household, them.id, user.id);
  await endMembership(household, them, 'removed', user.id);
  await record(user, 'member-removed', { detail: them.name });
}

/** Leaves a household you're in. Not if you're its only owner, and not your last one if you run the site. */
export async function leaveHousehold(user: User, household: HouseholdId = user.household): Promise<void> {
  await stored();
  if (!user.households.includes(household)) throw new HttpError(404, 'You’re not in that household.');
  const members = await membersOf(household);
  const others = members.filter((m) => m.id !== user.id);
  const owners = others.filter((m) => m.role === 'owner');
  if (!others.length) throw new HttpError(409, 'You’re the only one in it, so there’d be nobody left. To step away from it, close your account instead (on You); nothing in it is deleted.');
  if (user.roles[household] === 'owner' && !owners.length) throw new HttpError(409, 'You’re its only owner. Make someone else an owner first.');
  if (user.admin && user.households.length === 1) throw new HttpError(409, 'You run the site, so you need to stay in at least one household.');
  await handOver(household, user.id, (owners[0] ?? others[0]).id);
  await endMembership(household, members.find((m) => m.id === user.id)!, 'left', user.id);
  // In that household's log, so the people still in it see it.
  await record({ ...user, household }, 'left');
}

/** Marks someone's membership ended, keeping it on record. */
export async function endMembership(household: HouseholdId, m: Pick<Member, 'id' | 'role' | 'joinedAt'>, ended: 'removed' | 'left' | 'closed' | 'switched-off', by: UserId, at = new Date().toISOString()): Promise<void> {
  await getRepo().saveMembership({ householdId: household, personId: m.id, role: m.role, joinedAt: m.joinedAt, endedAt: at, endedBy: by, ended });
  forgetDirectory();
}

/**
 * Before `from` goes: the final say on the household's projects that aren't
 * approved yet passes to `to`, and the log says so.
 */
export async function handOver(household: HouseholdId, from: UserId, to: UserId): Promise<void> {
  const repo = getRepo();
  const projects = ((await repo.listProjects()) as ShirtProject[]).filter((p) => householdOf(p) === household && approverOf(p) === from && p.status !== 'approved');
  if (!projects.length) return;
  const [fromName, toName] = await Promise.all([personById(from), personById(to)]).then((ps) => ps.map((p) => p?.name ?? 'someone'));
  const by = { id: to, name: toName, admin: false, household, role: 'owner' as const, households: [household], roles: { [household]: 'owner' as const } };
  for (const project of projects) {
    project.approver = to;
    project.updatedAt = new Date().toISOString();
    await repo.saveProject(project);
    await record(by, 'approver-changed', { project, detail: `to ${toName}, since ${fromName} left` });
  }
}
