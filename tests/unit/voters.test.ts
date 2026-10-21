// More than two people per project: hearts counted and named for any
// household size, passes and maybes kept private however many are voting, and
// the final say handed to anyone in the household (by whoever may).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { preset } from '@/lib/design/occasions';
import type { User } from '@/lib/engine/types';
import { allOfYou, heartBadge, listNames, sharedCount, sharedLine, sharedTitle } from '@/lib/engine/together';
import { activityFor } from '@/lib/server/activity';
import { USERS } from '@/lib/server/auth';
import { approve } from '@/lib/server/decisions';
import { projectSummaries } from '@/lib/server/overview';
import { forgetDirectory, userById } from '@/lib/server/people';
import { createProject } from '@/lib/server/projects';
import type { LocalRepo } from '@/lib/server/repo/local';
import { canApprove, projectState, react, setApprover } from '@/lib/server/studio';

const ENV = ['ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.ERIN_GOOGLE_EMAIL = 'erin@example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** The Riveras: Sam owns the household; Ana and Leo are in it too. */
async function riveras(repo: LocalRepo): Promise<{ sam: User; ana: User; leo: User }> {
  await userById('joel');
  const t = Date.parse('2026-10-20T00:00:00.000Z');
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: new Date(t).toISOString() });
  for (const [i, [id, name, role]] of ([['sam', 'Sam', 'owner'], ['ana', 'Ana', 'member'], ['leo', 'Leo', 'member']] as const).entries()) {
    const at = new Date(t + i * 1000).toISOString();
    await repo.savePerson({ id, name, email: `${id}@example.com`, createdAt: at });
    await repo.saveMembership({ householdId: 'riveras', personId: id, role, joinedAt: at });
  }
  forgetDirectory();
  return { sam: (await userById('sam'))!, ana: (await userById('ana'))!, leo: (await userById('leo'))! };
}

const birthday = (by: User) => {
  const p = preset('birthday');
  return createProject(by, { occasion: 'birthday', basics: { ...p.example, title: 'Abuela’s 80th' }, copy: p.copyIdeas(p.example)[0] });
};
const order = { garment: 'tee' as const, color: 'navy', preset: 'standard', sizes: [{ who: 'Abuela', size: 'M' as const, qty: 1 }] };

describe('the words', () => {
  it('stay as they were for two, and count for more', () => {
    expect(listNames(['Erin'])).toBe('Erin');
    expect(listNames(['Erin', 'Sam'])).toBe('Erin and Sam');
    expect(listNames(['Erin', 'Sam', 'Ana'])).toBe('Erin, Sam and Ana');
    expect(listNames(['Erin', 'Sam', 'Ana', 'Leo', 'Mo'])).toBe('Erin, Sam and 3 others');
    expect([heartBadge(1, 2), heartBadge(2, 2), heartBadge(2, 4), heartBadge(4, 4)]).toEqual([null, 'Both', '2 of 4', 'Everyone']);
    expect([sharedLine(2, 2), sharedLine(3, 4), sharedLine(3, 3)]).toEqual(['You both love this', '3 of 4 love this', 'Everyone loves this']);
    expect([sharedCount(3, 2), sharedCount(1, 3), sharedCount(3, 3)]).toEqual(['3 you both love', '1 shared heart', '3 shared hearts']);
    expect([sharedTitle(2), sharedTitle(3), allOfYou(1), allOfYou(2), allOfYou(5)]).toEqual(['You both love', 'Shared hearts', 'you', 'both of you', 'everyone']);
  });
});

describe('three people voting', () => {
  it('see everyone’s hearts but nobody else’s passes or maybes', async () => {
    const { repo } = tempRepo();
    const { sam, ana, leo } = await riveras(repo);
    const project = await birthday(sam);
    const [a, b, c] = (await projectState(project.id, sam)).options;
    await react(ana, project.id, a.id, 'pass');
    await react(ana, project.id, b.id, 'maybe');
    await react(ana, project.id, c.id, 'love');
    await react(leo, project.id, c.id, 'love');
    await react(leo, project.id, a.id, 'love');

    const seen = (await projectState(project.id, sam)).reactions;
    expect(seen.map((r) => `${r.userId}:${r.value}:${r.optionId === c.id ? 'c' : r.optionId === a.id ? 'a' : 'b'}`).sort()).toEqual(['ana:love:c', 'leo:love:a', 'leo:love:c']);
    // Ana still sees her own pass and maybe.
    expect((await projectState(project.id, ana)).reactions.filter((r) => r.userId === 'ana').map((r) => r.value).sort()).toEqual(['love', 'maybe', 'pass']);
    expect((await projectState(project.id, ana)).members.map((m) => m.name)).toEqual(['Sam', 'Ana', 'Leo']);

    // Sam's heart on c makes it shared with two others; on the home screen, others' hearts he hasn't seen are counted too.
    await react(sam, project.id, c.id, 'love');
    const [home] = await projectSummaries(sam);
    expect(home).toMatchObject({ matches: 1, hearts: 1 });
    expect(home.theyLoved).toBe(1); // a, which Leo loves and Sam hasn't looked at
  });
});

describe('the final say', () => {
  it('starts with whoever started the project, and can go to anyone in the household', async () => {
    const { repo } = tempRepo();
    const { sam, ana, leo } = await riveras(repo);
    const project = await birthday(ana);
    expect(project.approver).toBe('ana');
    expect((await projectState(project.id, ana)).canChooseApprover).toBe(true);
    // Leo didn't start it, doesn't have the say and doesn't own the household.
    expect((await projectState(project.id, leo)).canChooseApprover).toBe(false);
    await expect(setApprover(leo, project.id, 'leo')).rejects.toMatchObject({ status: 403 });

    await setApprover(ana, project.id, 'leo');
    const now = await projectState(project.id, leo);
    expect(now).toMatchObject({ canApprove: true, approverName: 'Leo' });
    expect(canApprove(ana, now.project)).toBe(false);
    // Ana started it, so she can still change it; Sam owns the household, so he can too.
    expect((await projectState(project.id, ana)).canChooseApprover).toBe(true);
    await setApprover(sam, project.id, 'sam');
    expect((await projectState(project.id, sam)).approverName).toBe('Sam');

    // Nobody outside the household, and nothing made up.
    await expect(setApprover(sam, project.id, 'joel')).rejects.toMatchObject({ status: 400 });
    await expect(setApprover(sam, project.id, { id: 'ana' })).rejects.toMatchObject({ status: 400 });
    await expect(setApprover(USERS.joel, project.id, 'joel')).rejects.toMatchObject({ status: 404 });

    const log = (await activityFor(sam, { projectId: project.id })).entries.filter((e) => e.action === 'approver-changed');
    expect(log.map((e) => `${e.by} ${e.detail}`)).toEqual(['sam to Sam', 'ana to Leo']);
  });

  it('can’t change once it’s approved', async () => {
    const { repo } = tempRepo();
    const { sam, ana } = await riveras(repo);
    const project = await birthday(sam);
    const [first] = (await projectState(project.id, sam)).options;
    await approve(sam, project.id, { ...order, optionId: first.id });
    expect((await projectState(project.id, sam)).canChooseApprover).toBe(false);
    await expect(setApprover(sam, project.id, 'ana')).rejects.toMatchObject({ status: 409 });
    expect(canApprove(ana, (await projectState(project.id, ana)).project)).toBe(false);
  });
});
