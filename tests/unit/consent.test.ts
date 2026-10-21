// Agreeing to how Our Studio uses AI: nothing goes to an AI service until each
// person has said OK, the OK is on record with a date, and only they (and the
// admin) see it in the activity log.
import { describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { activityFor, record } from '@/lib/server/activity';
import { HttpError, USERS } from '@/lib/server/auth';
import { agree, beforeAI, CONSENT_VERSION, hasAgreed } from '@/lib/server/consent';

const { erin, joel } = USERS;

describe('agreeing to how AI is used', () => {
  it('refuses AI requests until you agree, and records the agreement once', async () => {
    const { repo } = tempRepo();
    expect(await hasAgreed(erin)).toBe(false);
    const refused = await beforeAI(erin, 'claude').catch((e) => e);
    expect(refused).toBeInstanceOf(HttpError);
    expect((refused as HttpError).status).toBe(403);

    await agree(erin);
    await agree(erin); // already agreed: nothing more to record
    expect(await hasAgreed(erin)).toBe(true);
    await expect(beforeAI(erin, 'claude')).resolves.toBeUndefined();
    const entries = await repo.listActivity({ by: 'erin', action: 'agreed', limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toBe(`how Our Studio uses AI (version ${CONSENT_VERSION})`);
    expect(Date.now() - Date.parse(entries[0].at)).toBeLessThan(60_000);

    // It's per person.
    expect(await hasAgreed(joel)).toBe(false);
    await expect(beforeAI(joel, 'art')).rejects.toThrow(/agree to how Our Studio uses AI/);
  });

  it('reads an agreement from the log, as another server would, and only for the current version', async () => {
    const { repo } = tempRepo();
    const entry = (detail: string) => ({ id: `a-${detail.length}`, at: new Date().toISOString(), by: 'joel' as const, action: 'agreed' as const, detail });
    await repo.addActivity(entry(`how Our Studio uses AI (version ${CONSENT_VERSION - 1})`));
    expect(await hasAgreed(joel)).toBe(false);
    await repo.addActivity(entry(`how Our Studio uses AI (version ${CONSENT_VERSION})`));
    expect(await hasAgreed(joel)).toBe(true);
  });

  it('shows an agreement only to that person and the admin', async () => {
    tempRepo();
    // Written straight to the log: this server already knows both have agreed, so agree() would skip it.
    for (const who of [erin, joel]) await record(who, 'agreed', { detail: `how Our Studio uses AI (version ${CONSENT_VERSION})` });
    const seenBy = async (who: typeof erin) => (await activityFor(who)).entries.filter((e) => e.action === 'agreed').map((e) => e.by);
    expect(await seenBy(erin)).toEqual(['erin']);
    expect((await seenBy(joel)).sort()).toEqual(['erin', 'joel']);
  });
});
