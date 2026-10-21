// AI budgets per household: each household has its own monthly limit (new
// ones start at $10; Joel's has none unless he sets one), the site's budget
// still stops everyone, and the money comes out of the right household's
// pocket however the call is reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn, tempRepo } from './helpers';
import { POST as setBudget } from '@/app/api/admin/budget/route';
import { POST as words } from '@/app/api/projects/[id]/words/route';
import { preset } from '@/lib/design/occasions';
import type { User } from '@/lib/engine/types';
import { USERS, type HttpError } from '@/lib/server/auth';
import { agree } from '@/lib/server/consent';
import { assumeHousehold, currentHousehold, setHousehold, withContext } from '@/lib/server/context';
import { forgetDirectory, getHousehold, setHouseholdBudget, userById } from '@/lib/server/people';
import { createProject } from '@/lib/server/projects';
import type { LocalRepo } from '@/lib/server/repo/local';
import { setupStatus } from '@/lib/server/setup';
import { DEFAULT_HOUSEHOLD_BUDGET_USD, householdBudget, reserveSpend, spentByHousehold, spentThisMonth } from '@/lib/server/spend';

const jar = vi.hoisted(() => ({ value: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === 'studio_session' && jar.value ? { value: jar.value } : undefined) }) }));

const SITE = 'https://studio.example.com';
const ENV = ['ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MONTHLY_BUDGET_USD', 'ANTHROPIC_API_KEY', 'VERCEL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.ERIN_GOOGLE_EMAIL = 'erin@example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
  // Email codes on, so sessions are signed with the server's own secret.
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  process.env.MONTHLY_BUDGET_USD = '100';
  jar.value = '';
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const { joel } = USERS;

/** The Riveras next door: Sam owns the household. */
async function riveras(repo: LocalRepo): Promise<User> {
  await userById('joel');
  const t = new Date().toISOString();
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: t, createdBy: 'sam' });
  await repo.savePerson({ id: 'sam', name: 'Sam', email: 'sam@example.com', createdAt: t });
  await repo.saveMembership({ householdId: 'riveras', personId: 'sam', role: 'owner', joinedAt: t });
  forgetDirectory();
  return (await userById('sam'))!;
}

/** Spends as if from a request in `household`. */
const spend = (household: string, usd: number, note = 'artwork', projectId?: string) =>
  withContext(async () => {
    setHousehold(household);
    return reserveSpend('test', 'm', usd, note, projectId);
  });

const refusal = async (p: Promise<unknown>) => {
  const e = (await p.then(
    () => null,
    (err: unknown) => err,
  )) as HttpError | null;
  expect(e?.status).toBe(402);
  return e!.message;
};

describe('a household’s own limit', () => {
  it('holds when the month has more entries than one read returns', async () => {
    const { repo } = tempRepo();
    await riveras(repo);
    // Like Supabase by default: a list comes back cut to its first 1,000 rows, however many there are.
    const all = repo.listSpendSince.bind(repo);
    repo.listSpendSince = async (iso, opts) => (await all(iso, opts)).slice(0, 1000);
    const at = new Date().toISOString();
    for (let i = 0; i < 1200; i++) await repo.addSpend({ id: `pad${i}`, at, provider: 'test', model: 'm', usd: 0, note: 'refused', householdId: 'riveras' });
    await (await spend('riveras', 9.5))(9.5);
    expect(await spentThisMonth('riveras')).toBe(9.5);
    await refusal(spend('riveras', 1));
    // A refused call leaves nothing behind.
    expect((await all(at)).filter((r) => r.note.startsWith('artwork'))).toHaveLength(1);
  });

  it('stops that household at its limit and nobody else', async () => {
    const { repo } = tempRepo();
    await riveras(repo);
    expect(householdBudget('riveras', await getHousehold('riveras'))).toBe(DEFAULT_HOUSEHOLD_BUDGET_USD);
    expect(householdBudget('first', await getHousehold('first'))).toBeNull();

    await (await spend('riveras', 6))(6);
    const message = await refusal(spend('riveras', 6));
    expect(message).toMatch(/^Your household’s AI budget for this month is used up \(\$6\.00 of \$10\)\. Joel can raise it\. /);
    // The refused hold is released, not counted.
    expect(await spentThisMonth('riveras')).toBe(6);

    // Joel's household has no limit of its own, so it carries on.
    await (await spend('first', 30))(30);
    expect(Object.fromEntries(await spentByHousehold())).toEqual({ riveras: 6, first: 30 });
    expect((await repo.listSpendSince('2000-01-01')).filter((r) => r.usd > 0).map((r) => r.householdId).sort()).toEqual(['first', 'riveras']);
  });

  it('counts older entries, from before households, as the first household’s', async () => {
    const { repo } = tempRepo();
    await repo.addSpend({ id: 'old', at: new Date().toISOString(), provider: 'fal', model: 'm', usd: 2.5, note: 'artwork' });
    expect(await spentThisMonth('first')).toBe(2.5);
    expect(await spentThisMonth('riveras')).toBe(0);
  });

  it('only Joel changes it, within reason, and clearing it goes back to the default', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    await expect(setHouseholdBudget(sam, 'riveras', 50)).rejects.toMatchObject({ status: 403 });
    await expect(setHouseholdBudget(joel, 'riveras', -1)).rejects.toMatchObject({ status: 400 });
    await expect(setHouseholdBudget(joel, 'riveras', '5')).rejects.toMatchObject({ status: 400 });
    await expect(setHouseholdBudget(joel, 'riveras', 5000)).rejects.toMatchObject({ status: 400 });
    await expect(setHouseholdBudget(joel, 'nobody', 5)).rejects.toMatchObject({ status: 404 });

    expect(await setHouseholdBudget(joel, 'riveras', 2.555)).toMatchObject({ budgetUsd: 2.56 });
    await refusal(spend('riveras', 3));
    expect(await setHouseholdBudget(joel, 'riveras', null)).not.toHaveProperty('budgetUsd');
    await (await spend('riveras', 3))(3);

    // A limit of nothing means no paid AI at all.
    await setHouseholdBudget(joel, 'first', 0);
    await refusal(spend('first', 0.01));
  });
});

describe('the site’s budget', () => {
  it('still stops everyone, and only Joel’s household sees its numbers', async () => {
    const { repo } = tempRepo();
    await riveras(repo);
    process.env.MONTHLY_BUDGET_USD = '5';
    await (await spend('riveras', 4))(4);
    expect(await refusal(spend('first', 2))).toMatch(/^This month's AI budget is used up \(\$4\.00 of \$5\)\. Joel can raise it in Setup\. /);
    const theirs = await refusal(spend('riveras', 2));
    expect(theirs).toMatch(/^The studio’s AI budget for this month is used up\. Joel can raise it\. /);
    expect(theirs).not.toContain('$');
  });
});

describe('whose money it is', () => {
  it('comes out of the project’s household, whatever household the request started in', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    const p = preset('birthday');
    const project = await createProject(sam, { occasion: 'birthday', basics: { ...p.example, title: 'Abuela’s 80th' }, copy: p.copyIdeas(p.example)[0] });
    await (await spend('first', 1, 'artwork', project.id))(1);
    expect(await spentThisMonth('riveras')).toBe(1);
    expect(await spentThisMonth('first')).toBe(0);
  });

  it('keeps a project’s household once it’s known', async () => {
    await withContext(async () => {
      assumeHousehold('first');
      expect(currentHousehold()).toBe('first');
      setHousehold('riveras');
      // Signing in again later in the same request doesn't move it back.
      assumeHousehold('first');
      expect(currentHousehold()).toBe('riveras');
    });
    expect(currentHousehold()).toBeUndefined();
  });

  it('follows a request through a route to the household’s budget', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    await agree(sam);
    const p = preset('birthday');
    const project = await createProject(sam, { occasion: 'birthday', basics: { ...p.example, title: 'Abuela’s 80th' }, copy: p.copyIdeas(p.example)[0] });
    await setHouseholdBudget(joel, 'riveras', 0);
    // A key that isn't real: the call is refused before anything is sent.
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
    jar.value = await signedIn('sam');
    const res = await words(
      new Request(`${SITE}/api/projects/${project.id}/words`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: '{}' }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/^Your household’s AI budget/);
  });
});

describe('Setup', () => {
  it('shows every household’s total and limit, but only Joel’s household’s notes', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    await (await spend('riveras', 1.5, 'artwork: Abuela’s cake'))(1.5);
    await (await spend('first', 2, 'artwork: anniversary sunset'))(2);
    const { budget } = await setupStatus(SITE);
    expect(budget).toMatchObject({ spent: 3.5, limit: 100, editable: true, newHouseholds: 10 });
    expect(budget.households).toEqual([
      { id: 'first', name: 'Joel & Erin', spent: 2, limit: null, custom: false, standard: null },
      { id: 'riveras', name: 'The Riveras', spent: 1.5, limit: 10, custom: false, standard: 10 },
    ]);
    expect(budget.recent.map((r) => r.note)).toEqual(['artwork: anniversary sunset']);

    const post = (body: object) =>
      setBudget(new Request(`${SITE}/api/admin/budget`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: JSON.stringify(body) }), {
        params: Promise.resolve({}),
      });
    jar.value = await signedIn(sam.id);
    expect((await post({ household: 'riveras', usd: 50 })).status).toBe(403);
    jar.value = await signedIn('joel');
    const ok = await post({ household: 'riveras', usd: 25 });
    expect(ok.status).toBe(200);
    expect((await setupStatus(SITE)).budget.households[1]).toMatchObject({ limit: 25, custom: true });
  });
});
