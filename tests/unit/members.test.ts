// Invites and membership: how anyone new gets in (a single-use link, good for
// a week, through Google or an emailed code, or one tap if signed in), what
// owners can change, leaving, switching households, closing, switching off, restoring and erasing accounts,
// and the list of signed-in browsers with "sign out everywhere".
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempRepo } from './helpers';
import { POST as devicesRoute } from '@/app/api/account/devices/route';
import { POST as acceptRoute } from '@/app/api/auth/invite/accept/route';
import { POST as openRoute } from '@/app/api/auth/invite/route';
import { GET as callback } from '@/app/api/auth/callback/route';
import { GET as start } from '@/app/api/auth/google/route';
import { POST as check } from '@/app/api/auth/code/check/route';
import { POST as send } from '@/app/api/auth/code/route';
import { POST as switchRoute } from '@/app/api/household/switch/route';
import { POST as logout } from '@/app/api/logout/route';
import { GET as nightly } from '@/app/api/cron/backup/route';
import { preset } from '@/lib/design/occasions';
import type { User } from '@/lib/engine/types';
import { closeAccount, eraseDue, eraseEmptyHousehold, eraseNow, keepData, peopleOverview, restore, switchOff } from '@/lib/server/account';
import { activityFor } from '@/lib/server/activity';
import { COOKIE, sessionCookie, userForSession, USERS } from '@/lib/server/auth';
import { RESEND } from '@/lib/server/email';
import { GOOGLE_TOKEN } from '@/lib/server/google';
import { acceptInvite, cancelInvite, createInvite, findInvite, INVITE_COOKIE, inviteCookie, openInvites } from '@/lib/server/invites';
import { leaveHousehold, removeMember, setRole } from '@/lib/server/membership';
import { forgetDirectory, getHousehold, membersOf, pastMembersOf, personByEmail, userById } from '@/lib/server/people';
import { createProject } from '@/lib/server/projects';
import type { LocalRepo } from '@/lib/server/repo/local';
import { deviceOf, devicesOf, signOutDevice, signOutEverywhere } from '@/lib/server/sessions';
import { householdBudget } from '@/lib/server/spend';
import { projectSummaries } from '@/lib/server/overview';
import { canManage, projectState, react } from '@/lib/server/studio';

const jar = vi.hoisted(() => ({ value: '', household: '' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'studio_session' && jar.value ? { value: jar.value } : name === 'studio_household' && jar.household ? { value: jar.household } : undefined),
  }),
}));

const SITE = 'https://studio.example.com';
const CLIENT = '1234567890-abcdefghij.apps.googleusercontent.com';
const ENV = [
  'ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'SIGN_IN_LINKS', 'VERCEL', 'MONTHLY_BUDGET_USD', 'CRON_SECRET',
];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

let emails: { to: string[]; subject: string }[] = [];
let google: object = {};
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.ERIN_GOOGLE_EMAIL = 'erin.example@gmail.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel.example@gmail.com';
  // Email codes and Google both on, so sessions are signed with the server's own secret.
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  process.env.GOOGLE_CLIENT_ID = CLIENT;
  process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-not-a-real-secret';
  jar.value = '';
  jar.household = '';
  emails = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === RESEND) {
      emails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'email_1' });
    }
    if (url === GOOGLE_TOKEN) return Response.json(google);
    return realFetch(input, init);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const { joel, erin } = USERS;
const ctx = { params: Promise.resolve({}) };
const post = (path: string, body: object, cookie = '') =>
  new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const setCookie = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0];
const tokenOf = (link: string) => link.split('#')[1];
const birthday = (by: User, title = 'Abuela’s 80th') => {
  const p = preset('birthday');
  return createProject(by, { occasion: 'birthday', basics: { ...p.example, title }, copy: p.copyIdeas(p.example)[0] });
};

/** The Riveras: Sam owns the household, Ana is in it too. */
async function riveras(repo: LocalRepo): Promise<{ sam: User; ana: User }> {
  await userById('joel');
  const t = Date.parse('2026-10-01T00:00:00.000Z');
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: new Date(t).toISOString() });
  for (const [i, [id, name, role]] of ([['sam', 'Sam', 'owner'], ['ana', 'Ana', 'member']] as const).entries()) {
    const at = new Date(t + i * 1000).toISOString();
    await repo.savePerson({ id, name, email: `${id}@example.com`, createdAt: at });
    await repo.saveMembership({ householdId: 'riveras', personId: id, role, joinedAt: at });
  }
  forgetDirectory();
  return { sam: (await userById('sam'))!, ana: (await userById('ana'))! };
}

describe('invites', () => {
  it('only an owner invites into a household, only Joel to start one, and the link holds the only copy of the secret', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    await expect(createInvite(ana, { name: 'Leo' }, SITE)).rejects.toMatchObject({ status: 403 });
    await expect(createInvite(sam, { kind: 'household', name: 'Mo' }, SITE)).rejects.toMatchObject({ status: 403 });
    await expect(createInvite(sam, { name: '   ' }, SITE)).rejects.toMatchObject({ status: 400 });

    const { link, invite } = await createInvite(sam, { name: '  Leo ' }, SITE);
    expect(link).toMatch(/^https:\/\/studio\.example\.com\/join#[\w-]{43}$/);
    expect(invite).toMatchObject({ kind: 'member', householdId: 'riveras', name: 'Leo', createdBy: 'sam' });
    const days = (Date.parse(invite.expiresAt) - Date.parse(invite.createdAt)) / 86_400_000;
    expect(days).toBe(7);
    expect(JSON.stringify(await repo.listInvites())).not.toContain(tokenOf(link));
    expect((await findInvite(tokenOf(link))).view).toEqual({ kind: 'member', from: 'Sam', household: 'The Riveras', name: 'Leo', expiresAt: invite.expiresAt });
    expect((await openInvites(sam))!.map((i) => i.name)).toEqual(['Leo']);
    expect(await openInvites(ana)).toEqual([]);
    expect((await activityFor(sam)).entries.map((e) => `${e.by} ${e.action} ${e.detail}`)).toContain('sam invited Leo');

    await expect(findInvite('nope')).rejects.toMatchObject({ status: 404 });
    await expect(findInvite('x'.repeat(43))).rejects.toMatchObject({ status: 404 });
  });

  it('lets someone new in by email code, once, with the name they chose', async () => {
    const { repo } = tempRepo();
    const { sam } = await riveras(repo);
    const { link } = await createInvite(sam, { name: 'Leo' }, SITE);

    // Opening the link holds it in this browser, with the name they give.
    const opened = await openRoute(post('/api/auth/invite', { token: tokenOf(link) }), ctx);
    expect(await opened.json()).toMatchObject({ invite: { from: 'Sam', household: 'The Riveras', name: 'Leo' } });
    const named = await openRoute(post('/api/auth/invite', { token: tokenOf(link), name: 'Leonardo' }), ctx);
    const held = setCookie(named, INVITE_COOKIE)!;
    expect(named.headers.getSetCookie().find((c) => c.startsWith(INVITE_COOKIE))).toMatch(/Path=\/api\/auth; .*HttpOnly/i);
    // A reload: no secret in the body, the held one is used.
    expect((await openRoute(post('/api/auth/invite', {}, `${INVITE_COOKIE}=${held}`), ctx)).status).toBe(200);

    // An address nobody knows gets a code, because this browser holds an invite.
    const asked = await send(post('/api/auth/code', { email: 'Leo@Example.com' }, `${INVITE_COOKIE}=${held}`), ctx);
    expect(emails.map((e) => e.to[0])).toEqual(['leo@example.com']);
    const code = emails[0].subject.slice(0, 6);
    const res = await check(post('/api/auth/code/check', { code }, `studio_code=${setCookie(asked, 'studio_code')}; ${INVITE_COOKIE}=${held}`), ctx);
    expect(res.status).toBe(200);
    const leo = (await userForSession(setCookie(res, COOKIE)))!;
    expect(leo).toMatchObject({ name: 'Leonardo', household: 'riveras', role: 'member', households: ['riveras'] });
    expect(await personByEmail('leo@example.com')).toMatchObject({ id: leo.id, name: 'Leonardo' });
    expect(setCookie(res, 'studio_household')).toBe('riveras');
    expect(setCookie(res, INVITE_COOKIE)).toBe('');
    expect((await activityFor(sam)).entries.map((e) => `${e.action} ${e.detail ?? ''}`)).toContain('joined invited by Sam');

    // Used: nobody else gets in with it, and without one an unknown address still gets nothing.
    await expect(findInvite(tokenOf(link))).rejects.toMatchObject({ status: 410 });
    await send(post('/api/auth/code', { email: 'mo@example.com' }, `${INVITE_COOKIE}=${held}`), ctx);
    expect(emails).toHaveLength(1);
  });

  it('lets someone new in through Google, and starts a household when Joel sent it', async () => {
    const { repo } = tempRepo();
    const { link, invite } = await createInvite(joel, { kind: 'household', name: 'Mo', household: 'The Okafors' }, SITE);
    expect(invite).toMatchObject({ kind: 'household', householdName: 'The Okafors' });
    expect((await findInvite(tokenOf(link))).view).toMatchObject({ kind: 'household', from: 'Joel', household: 'The Okafors' });
    const held = inviteCookie(tokenOf(link), 'Mo').value;

    const verifier = (await start(new Request(`${SITE}/api/auth/google`))).cookies.get('studio_pkce')!.value;
    google = { id_token: [{ alg: 'RS256' }, { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 3600, email: 'mo@example.com', email_verified: true }].map((o) => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.sig' };
    const res = await callback(new NextRequest(`${SITE}/api/auth/callback?code=abc`, { headers: { cookie: `studio_pkce=${verifier}; ${INVITE_COOKIE}=${held}` } }));
    expect(res.headers.get('location')).toBe(`${SITE}/`);
    const mo = (await userForSession(res.cookies.get(COOKIE)!.value))!;
    expect(mo).toMatchObject({ name: 'Mo', household: invite.householdId, role: 'owner' });
    expect(await getHousehold(invite.householdId)).toMatchObject({ name: 'The Okafors', createdBy: mo.id });
    expect(householdBudget(invite.householdId, await getHousehold(invite.householdId))).toBe(10);
    expect(res.cookies.get('studio_household')?.value).toBe(invite.householdId);

    // The same link again, from someone else: turned away, and told why.
    const again = (await start(new Request(`${SITE}/api/auth/google`))).cookies.get('studio_pkce')!.value;
    google = { id_token: [{ alg: 'RS256' }, { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 3600, email: 'bea@example.com', email_verified: true }].map((o) => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.sig' };
    const refused = await callback(new NextRequest(`${SITE}/api/auth/callback?code=abc`, { headers: { cookie: `studio_pkce=${again}; ${INVITE_COOKIE}=${held}` } }));
    expect(refused.headers.get('location')).toBe(`${SITE}/?signin=invite-gone`);
    expect(await personByEmail('bea@example.com')).toBeNull();
    expect((await repo.listInvites())![0]).toMatchObject({ usedBy: mo.id });
  });

  it('adds a household to someone already signed in, and leaves the invite alone if they’re in it already', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    const first = await createInvite(sam, { name: 'Ana' }, SITE);
    expect(await acceptInvite(tokenOf(first.link), { user: ana })).toMatchObject({ id: 'ana', household: 'riveras' });
    // Still unused: Ana was already in.
    expect((await findInvite(tokenOf(first.link))).invite.usedAt).toBeUndefined();

    const { link } = await createInvite(sam, { name: 'Erin' }, SITE);
    jar.value = sessionCookie('erin').value;
    const res = await acceptRoute(post('/api/auth/invite/accept', { token: tokenOf(link) }), ctx);
    expect(res.status).toBe(200);
    expect(setCookie(res, 'studio_household')).toBe('riveras');
    const both = (await userById('erin', 'riveras'))!;
    expect(both).toMatchObject({ household: 'riveras', role: 'member', households: ['first', 'riveras'], roles: { first: 'member', riveras: 'member' } });
    expect((await userById('erin'))!.household).toBe('first');
  });

  it('can be cancelled by its household’s owner, and runs out after a week', async () => {
    const { repo } = tempRepo();
    const { sam } = await riveras(repo);
    const { link, invite } = await createInvite(sam, { name: 'Leo' }, SITE);
    await expect(cancelInvite(joel, invite.id)).rejects.toMatchObject({ status: 404 });
    await cancelInvite(sam, invite.id);
    await expect(findInvite(tokenOf(link))).rejects.toMatchObject({ status: 404 });

    const late = await createInvite(sam, { name: 'Mo' }, SITE);
    await repo.saveInvite({ ...late.invite, expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(findInvite(tokenOf(late.link))).rejects.toMatchObject({ status: 410, message: expect.stringMatching(/run out/) });
    await expect(acceptInvite(tokenOf(late.link), { email: 'mo@example.com' })).rejects.toMatchObject({ status: 410 });
  });
});

describe('arriving on another server', () => {
  it('finds someone who joined a moment ago, even when this server’s copy of the directory is older', async () => {
    const { repo } = tempRepo();
    await riveras(repo);
    expect(await userById('sam')).toMatchObject({ household: 'riveras' });
    // Written straight to storage, as another server would: this one's copy doesn't know yet.
    const at = new Date().toISOString();
    await repo.savePerson({ id: 'leo', name: 'Leo', email: 'leo@example.com', createdAt: at });
    await repo.saveMembership({ householdId: 'riveras', personId: 'leo', role: 'member', joinedAt: at });
    await repo.saveMembership({ householdId: 'first', personId: 'sam', role: 'member', joinedAt: at });
    expect(await userForSession(sessionCookie('leo').value)).toMatchObject({ id: 'leo', household: 'riveras' });
    await new Promise((r) => setTimeout(r, 2100));
    expect(await userById('sam', 'first')).toMatchObject({ household: 'first', households: ['riveras', 'first'] });
  });
});

describe('who’s in the household', () => {
  it('owners make owners, and there’s always one left', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    await expect(setRole(ana, 'ana', 'owner')).rejects.toMatchObject({ status: 403 });
    await expect(setRole(sam, 'sam', 'member')).rejects.toMatchObject({ status: 409 });
    await setRole(sam, 'ana', 'owner');
    expect((await userById('ana'))!.role).toBe('owner');
    await setRole((await userById('ana'))!, 'sam', 'member');
    expect((await membersOf('riveras')).map((m) => `${m.name}:${m.role}`)).toEqual(['Ana:owner', 'Sam:member']);
  });

  it('taking someone out hands on their final say and stops their hearts counting', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    const project = await birthday(ana);
    expect(project.approver).toBe('ana');
    const [a] = (await projectState(project.id, sam)).options;
    await react(ana, project.id, a.id, 'love');
    expect((await projectState(project.id, sam)).reactions).toHaveLength(1);

    await expect(removeMember(ana, 'sam')).rejects.toMatchObject({ status: 403 });
    await expect(removeMember(sam, 'sam')).rejects.toMatchObject({ status: 400 });
    await removeMember(sam, 'ana');
    expect(await userById('ana')).toBeNull();
    const state = await projectState(project.id, sam);
    expect(state.project.approver).toBe('sam');
    expect(state.reactions).toEqual([]);
    expect(state.members.map((m) => m.name)).toEqual(['Sam']);
    expect((await projectSummaries(sam)).find((p) => p.project.id === project.id)).toMatchObject({ theyLoved: 0 });
    const log = (await activityFor(sam)).entries.map((e) => `${e.by} ${e.action} ${e.detail ?? ''}`.trim());
    expect(log).toContain('sam member-removed Ana');
    expect(log).toContain('sam approver-changed to Sam, since Ana left');
    // Not deleted: a past member, who comes back with her hearts.
    expect(await pastMembersOf('riveras')).toEqual([expect.objectContaining({ id: 'ana', ended: 'removed', invitable: true })]);
    const { link } = await createInvite(sam, { name: 'Ana' }, SITE);
    await acceptInvite(tokenOf(link), { email: 'ana@example.com' });
    expect((await projectState(project.id, sam)).reactions.map((r) => r.userId)).toEqual(['ana']);
    expect(await pastMembersOf('riveras')).toEqual([]);
  });

  it('nobody can take Joel out, and he can’t leave his only household', async () => {
    const { repo } = tempRepo();
    await riveras(repo);
    await repo.saveMembership({ householdId: 'first', personId: 'erin', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' });
    forgetDirectory();
    await expect(removeMember((await userById('erin'))!, 'joel')).rejects.toMatchObject({ status: 403 });
    await expect(leaveHousehold((await userById('joel'))!)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/run the site/) });
  });

  it('anyone can leave, but not the only owner, and not the only person', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    await expect(leaveHousehold(sam)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/only owner/) });
    await leaveHousehold(ana);
    expect(await userById('ana')).toBeNull();
    expect((await activityFor(sam)).entries.map((e) => `${e.by} ${e.action}`)).toContain('ana left');
    await expect(leaveHousehold((await userById('sam'))!)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/only one in it/) });
  });

  it('switches which household you’re working in, only to one you’re in, and an owner there can manage its projects from anywhere', async () => {
    const { repo } = tempRepo();
    const { sam } = await riveras(repo);
    await repo.saveMembership({ householdId: 'first', personId: 'sam', role: 'member', joinedAt: '2026-10-02T00:00:00.000Z' });
    forgetDirectory();
    jar.value = sessionCookie('sam').value;
    const ok = await switchRoute(post('/api/household/switch', { household: 'first' }), ctx);
    expect(setCookie(ok, 'studio_household')).toBe('first');
    expect((await switchRoute(post('/api/household/switch', { household: 'nowhere' }), ctx)).status).toBe(404);
    const theirs = await birthday(sam, 'Riveras reunion');
    const inFirst = (await userById('sam', 'first'))!;
    expect(inFirst).toMatchObject({ household: 'first', role: 'member' });
    expect(canManage(inFirst, theirs)).toBe(true);
    expect(canManage(erin, theirs)).toBe(false);
  });
});

describe('closing, switching off, restoring and erasing accounts', () => {
  const DAY = 86_400_000;
  /** Signs in through Google as whoever has this address, and says where that lands. */
  async function googleAs(email: string): Promise<string> {
    const verifier = (await start(new Request(`${SITE}/api/auth/google`))).cookies.get('studio_pkce')!.value;
    google = { id_token: [{ alg: 'RS256' }, { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 3600, email, email_verified: true }].map((o) => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.sig' };
    const res = await callback(new NextRequest(`${SITE}/api/auth/callback?code=abc`, { headers: { cookie: `studio_pkce=${verifier}` } }));
    return res.headers.get('location')!;
  }

  it('closing your own keeps everything, hands on what you looked after, and an invite brings you back', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    const project = await birthday(sam);
    const [a, b] = (await projectState(project.id, ana)).options;
    await react(sam, project.id, a.id, 'love');
    await react(sam, project.id, b.id, 'pass');

    await expect(closeAccount(joel, { confirm: 'close' })).rejects.toMatchObject({ status: 403 });
    await expect(closeAccount(sam, { confirm: 'yes' })).rejects.toMatchObject({ status: 400 });
    expect(await closeAccount(sam, { confirm: ' Close ' })).toEqual({ eraseAfter: null });

    expect(await userById('sam')).toBeNull();
    expect(await personByEmail('sam@example.com')).toMatchObject({ archivedWhy: 'closed', archivedBy: 'sam' });
    expect((await repo.listReactions(project.id)).filter((r) => r.userId === 'sam')).toHaveLength(2);
    // Ana looks after it now, with the final say Sam had, and Sam's heart no longer counts.
    const anaNow = (await userById('ana'))!;
    expect(anaNow.role).toBe('owner');
    const state = await projectState(project.id, anaNow);
    expect(state.project.approver).toBe('ana');
    expect(state.reactions).toEqual([]);
    expect(await pastMembersOf('riveras')).toEqual([expect.objectContaining({ id: 'sam', name: 'Sam', ended: 'closed', invitable: true })]);
    expect((await activityFor(anaNow)).entries.map((e) => `${e.by} ${e.action}`)).toContain('sam account-closed');
    // Google vouches it's them, so they're told it's closed rather than turned away as a stranger.
    expect(await googleAs('sam@example.com')).toBe(`${SITE}/?signin=closed`);

    // Asked back: the same account, with its hearts.
    const { link } = await createInvite(anaNow, { name: 'Sam' }, SITE);
    expect(await acceptInvite(tokenOf(link), { email: 'sam@example.com' })).toMatchObject({ id: 'sam', household: 'riveras', role: 'member' });
    expect((await personByEmail('sam@example.com'))!.archivedAt).toBeUndefined();
    expect((await projectState(project.id, anaNow)).reactions.map((r) => `${r.userId}:${r.value}`)).toEqual(['sam:love']);
  });

  it('switched off by Joel: an invite can’t bring them back, a restore does, and old cookies stay dead', async () => {
    const { repo } = tempRepo();
    const { sam } = await riveras(repo);
    const before = sessionCookie('ana', undefined, Date.now() - 60_000).value;
    await expect(switchOff(sam, 'ana')).rejects.toMatchObject({ status: 403 });
    await expect(switchOff(joel, 'joel')).rejects.toMatchObject({ status: 403 });
    await switchOff(joel, 'ana');
    await expect(switchOff(joel, 'ana')).rejects.toMatchObject({ status: 409 });

    expect(await userForSession(before)).toBeNull();
    expect(await pastMembersOf('riveras')).toEqual([expect.objectContaining({ id: 'ana', ended: 'switched-off', invitable: false })]);
    expect((await activityFor(sam)).entries.map((e) => `${e.by} ${e.action} ${e.detail ?? ''}`.trim())).toContain('joel account-switched-off Ana');
    expect(await googleAs('ana@example.com')).toBe(`${SITE}/?signin=switched-off`);
    const { link } = await createInvite(sam, { name: 'Ana' }, SITE);
    await expect(acceptInvite(tokenOf(link), { email: 'ana@example.com' })).rejects.toMatchObject({ status: 403 });
    // Not used up by trying.
    expect((await findInvite(tokenOf(link))).invite.usedAt).toBeUndefined();

    await restore(joel, 'ana');
    expect(await userById('ana')).toMatchObject({ household: 'riveras', role: 'member' });
    expect(await userForSession(before)).toBeNull();
    expect(await userForSession(sessionCookie('ana').value)).toMatchObject({ id: 'ana' });
    expect((await activityFor(sam)).entries.map((e) => `${e.by} ${e.action}`)).toContain('joel account-restored');
  });

  it('erases on request after 30 days and never sooner, unless Joel keeps it or erases it himself', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    const project = await birthday(sam);
    const [a] = (await projectState(project.id, ana)).options;
    await react(ana, project.id, a.id, 'love');

    const { eraseAfter } = await closeAccount(sam, { confirm: 'close', erase: true });
    expect(Date.parse(eraseAfter!) - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect(await eraseDue()).toBe(0);
    await keepData(joel, 'sam');
    expect(await eraseDue(Date.now() + 31 * DAY)).toBe(0);
    expect(await personByEmail('sam@example.com')).not.toBeNull();

    // Ana (now the owner) closes too and asks to be erased: in 30 days she's gone, but the household stays for Sam.
    await closeAccount((await userById('ana'))!, { confirm: 'close', erase: true });
    expect(await eraseDue(Date.now() + 31 * DAY)).toBe(1);
    expect(await personByEmail('ana@example.com')).toBeNull();
    expect((await repo.listReactions(project.id)).filter((r) => r.userId === 'ana')).toEqual([]);
    expect(await repo.listActivity({ by: 'ana', action: 'signed-in', limit: 5 })).toEqual([]);
    expect(await getHousehold('riveras')).not.toBeNull();

    await expect(eraseNow(joel, 'erin', 'Erin')).rejects.toMatchObject({ status: 409 });
    await expect(eraseNow(joel, 'sam', 'Samuel')).rejects.toMatchObject({ status: 400 });
    await eraseNow(joel, 'sam', 'sam');
    // Nobody could come back to it now, so it went with him.
    expect(await personByEmail('sam@example.com')).toBeNull();
    expect(await getHousehold('riveras')).toBeNull();
    expect(await repo.getProject(project.id)).toBeNull();
  });

  it('shows Joel everyone, and erases a household nobody’s in only by its name', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    await birthday(sam);
    await closeAccount(ana, { confirm: 'close' });
    await closeAccount((await userById('sam'))!, { confirm: 'close' });

    await expect(peopleOverview(erin)).rejects.toMatchObject({ status: 403 });
    const view = await peopleOverview(joel);
    expect(view.people.map((p) => `${p.name}:${p.status}:${p.households.map((h) => h.name).join('+')}`)).toEqual([
      'Erin:open:Joel & Erin',
      'Joel:open:Joel & Erin',
      'Ana:closed:The Riveras',
      'Sam:closed:The Riveras',
    ]);
    expect(view.empty).toEqual([expect.objectContaining({ id: 'riveras', name: 'The Riveras', projects: 1 })]);

    await expect(eraseEmptyHousehold(joel, 'first', 'Joel & Erin')).rejects.toMatchObject({ status: 409 });
    await expect(eraseEmptyHousehold(joel, 'riveras', 'Riveras')).rejects.toMatchObject({ status: 400 });
    await eraseEmptyHousehold(joel, 'riveras', 'the riveras');
    expect(await getHousehold('riveras')).toBeNull();
    // Restoring Sam now opens his account, but there's no household left to put him in.
    await restore(joel, 'sam');
    expect((await peopleOverview(joel)).people.find((p) => p.id === 'sam')).toMatchObject({ status: 'open', households: [] });
    expect(await userById('sam')).toBeNull();
  });

  it('the nightly job backs up first, then erases whoever’s due', async () => {
    const { repo } = tempRepo();
    const { ana } = await riveras(repo);
    await closeAccount(ana, { confirm: 'close', erase: true });
    await repo.savePerson({ ...(await personByEmail('ana@example.com'))!, eraseAfter: new Date(Date.now() - 1000).toISOString() });
    forgetDirectory();
    process.env.CRON_SECRET = 'test-cron-secret-not-real';
    const res = await nightly(new Request(`${SITE}/api/cron/backup`, { headers: { authorization: 'Bearer test-cron-secret-not-real' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ erased: 1 });
    expect(await personByEmail('ana@example.com')).toBeNull();
  });
});

describe('where you’re signed in', () => {
  it('lists each browser, signs one out, and signs out everywhere else without touching this one', async () => {
    const { repo } = tempRepo();
    const { sam } = await riveras(repo);
    // An older cookie from before the list, then this browser signing in with a code.
    const old = sessionCookie('sam', undefined, Date.now() - 60_000).value;
    const asked = (await send(post('/api/auth/code', { email: 'sam@example.com' }), ctx)).headers.getSetCookie();
    const res = await check(post('/api/auth/code/check', { code: emails[0].subject.slice(0, 6) }, asked.map((c) => c.split(';')[0]).join('; ')), ctx);
    const here = setCookie(res, COOKIE)!;
    expect(here).toMatch(/^v2\.sam\.[a-z0-9]{16}\./);
    const hereId = here.split('.')[2];

    const list = (await devicesOf(sam, hereId))!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ device: 'iPhone · Safari', via: 'an email code', current: true });
    expect(await userForSession(here)).toMatchObject({ id: 'sam' });
    expect(await userForSession(old)).toMatchObject({ id: 'sam' });

    // A second browser, signed out from the list.
    await repo.saveSession({ id: 'abcdefghjkmnpqrs', personId: 'sam', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), device: 'Mac · Chrome', via: 'Google' });
    const second = sessionCookie('sam', 'abcdefghjkmnpqrs').value;
    expect(await userForSession(second)).toMatchObject({ id: 'sam' });
    await expect(signOutDevice(erin, 'abcdefghjkmnpqrs')).rejects.toMatchObject({ status: 404 });
    await signOutDevice(sam, 'abcdefghjkmnpqrs');
    expect(await userForSession(second)).toBeNull();

    // Everywhere else: the old cookie stops, this browser carries on with a fresh one.
    jar.value = here;
    const all = await devicesRoute(post('/api/account/devices', { action: 'everywhere' }), ctx);
    expect(all.status).toBe(200);
    const fresh = setCookie(all, COOKIE)!;
    expect(await userForSession(old)).toBeNull();
    expect(await userForSession(fresh)).toMatchObject({ id: 'sam' });
    expect((await devicesOf(sam))!.map((d) => d.id)).toEqual([hereId]);

    // Signing out here takes it off the list as well.
    jar.value = fresh;
    await logout(post('/api/logout', {}));
    expect(await repo.listSessions('sam')).toEqual([]);
    expect(await userForSession(fresh)).toBeNull();
    await expect(signOutEverywhere(sam)).resolves.toBeTypeOf('number');
  });

  it('names devices briefly, and keeps nothing else about the browser', () => {
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')).toBe('Mac · Chrome');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('Windows · Edge');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/130.0 Mobile/15E148')).toBe('iPhone · Firefox');
    expect(deviceOf(null)).toBe('A device · a browser');
  });
});
