// A new household's first visit: nothing of the first household's (its
// projects and their details) shows up or leaks into theirs, and the
// welcome shows to people who arrived by invite until they've seen it or
// started something.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempRepo } from './helpers';
import { POST as welcomed } from '@/app/api/account/welcomed/route';
import { POST as create } from '@/app/api/projects/route';
import { preset } from '@/lib/design/occasions';
import type { User } from '@/lib/engine/types';
import { sessionCookie, USERS } from '@/lib/server/auth';
import { archivedCount, projectSummaries } from '@/lib/server/overview';
import { forgetDirectory, needsWelcome, userById } from '@/lib/server/people';
import { createProject } from '@/lib/server/projects';
import type { LocalRepo } from '@/lib/server/repo/local';
import { artIdeasOf, contextOf, ensureSeed, factsOf, projectFor, SEED_PROJECT_ID } from '@/lib/server/studio';

const jar = vi.hoisted(() => ({ value: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === 'studio_session' && jar.value ? { value: jar.value } : undefined) }) }));

const SITE = 'https://studio.example.com';
const ENV = ['ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.ERIN_GOOGLE_EMAIL = 'erin@example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  jar.value = '';
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const { joel, erin } = USERS;
const post = (path: string, body: object) =>
  new Request(`${SITE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({}) };

async function riveras(repo: LocalRepo): Promise<User> {
  await userById('joel');
  const t = new Date().toISOString();
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: t, createdBy: 'sam' });
  await repo.savePerson({ id: 'sam', name: 'Sam', email: 'sam@example.com', createdAt: t });
  await repo.saveMembership({ householdId: 'riveras', personId: 'sam', role: 'owner', joinedAt: t });
  forgetDirectory();
  return (await userById('sam'))!;
}

describe('a new household’s first visit', () => {
  it('starts empty: the first household’s projects stay with them', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    await ensureSeed();
    expect(await projectSummaries(sam)).toEqual([]);
    expect(await archivedCount(sam)).toBe(0);
    await expect(projectFor(sam, SEED_PROJECT_ID)).rejects.toMatchObject({ status: 404 });
    expect((await projectSummaries(joel)).map((s) => s.project.id)).toEqual([SEED_PROJECT_ID]);
  });

  it('makes projects with none of another project’s details', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    const p = preset('birthday');
    const project = await createProject(sam, { occasion: 'birthday', basics: { ...p.example, title: 'Abuela’s 80th' }, copy: p.copyIdeas(p.example)[0] });
    expect(project).toMatchObject({ householdId: 'riveras', approver: 'sam', createdBy: 'sam' });
    const told = `${contextOf(project)} ${artIdeasOf(project).join(' ')} ${JSON.stringify(factsOf(project))}`;
    expect(told).not.toMatch(/Lisbon|Porto|Joel|Erin|anniversary/i);
  });

  it('welcomes people who came by invite until they say Got it, or start something', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    // Joel and Erin were here first.
    expect(await needsWelcome(joel)).toBe(false);
    expect(await needsWelcome(erin)).toBe(false);
    expect(await needsWelcome(sam)).toBe(true);

    jar.value = sessionCookie('sam').value;
    const p = preset('trip');
    const made = await create(post('/api/projects', { occasion: 'trip', basics: { ...p.example, title: 'Lake week' }, copy: p.copyIdeas(p.example)[0] }), ctx);
    expect(made.status).toBe(200);
    expect(await needsWelcome((await userById('sam'))!)).toBe(false);

    // Someone else in the household, who only dismisses it.
    await repo.savePerson({ id: 'ana', name: 'Ana', email: 'ana@example.com', createdAt: new Date().toISOString() });
    await repo.saveMembership({ householdId: 'riveras', personId: 'ana', role: 'member', joinedAt: new Date().toISOString() });
    forgetDirectory();
    expect(await needsWelcome((await userById('ana'))!)).toBe(true);
    jar.value = sessionCookie('ana').value;
    expect((await welcomed(post('/api/account/welcomed', {}), ctx)).status).toBe(200);
    expect(await needsWelcome((await userById('ana'))!)).toBe(false);
    expect((await repo.loadDirectory())!.people.find((x) => x.id === 'ana')!.welcomedAt).toBeTruthy();
  });
});
