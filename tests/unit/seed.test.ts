// The sample project a laptop and the tests start with: complete, kept for
// good, and never made anywhere but laptop storage. Real projects carry their
// own details in their own records.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { USERS } from '@/lib/server/auth';
import { archiveProject, deleteProject } from '@/lib/server/archive';
import { setRepo } from '@/lib/server/repo';
import { SupabaseRepo } from '@/lib/server/repo/supabase';
import { ensureSeed, SEED_PROJECT_ID, type ShirtProject } from '@/lib/server/studio';

const ENV = ['ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('the sample project', () => {
  it('carries all its details in its own record, and is kept for good', async () => {
    const { repo } = tempRepo();
    await ensureSeed();
    const sample = (await repo.getProject(SEED_PROJECT_ID)) as ShirtProject;
    expect(sample).toMatchObject({ keep: true, approver: 'erin', householdId: 'first' });
    for (const field of ['occasions', 'facts', 'context', 'copyIdeas', 'ticket', 'artIdeas', 'artVibes'] as const) expect(sample.brief[field], field).toBeTruthy();
    await archiveProject(USERS.joel, SEED_PROJECT_ID);
    await expect(deleteProject(USERS.joel, SEED_PROJECT_ID, 'Sample Shirt')).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/kept for good/) });
  });

  it('is never made in production storage', async () => {
    // A Supabase repo that would fail on any request: ensureSeed mustn't make one.
    setRepo(new SupabaseRepo('https://nowhere.invalid', 'sb_secret_test_not_real'));
    await expect(ensureSeed()).resolves.toBeUndefined();
  });
});
