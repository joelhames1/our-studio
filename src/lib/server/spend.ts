// Keeps AI spending inside the budgets Joel sets: one for the whole site
// (MONTHLY_BUDGET_USD), and one per household so no household can use up
// everyone else's month. The first household has no limit of its own unless
// Joel gives it one; the site's budget covers it.
import { FIRST_HOUSEHOLD, type Household, type HouseholdId, type SpendEntry } from '@/lib/engine/types';
import { ADMIN, HttpError } from './auth';
import { config } from './config';
import { currentHousehold } from './context';
import { getHousehold } from './people';
import { getRepo } from './repo';
import { newId } from './ids';

/** What a new household may spend on AI a month until Joel says otherwise. */
export const DEFAULT_HOUSEHOLD_BUDGET_USD = 10;

export function monthStart(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

const round = (usd: number) => Math.round(Math.max(0, usd) * 10000) / 10000;
/** How a hold reads until its call settles it. */
const IN_PROGRESS = ' (in progress)';
/** Longer than any request runs, so a hold still in progress after this was cut off. */
const CUT_OFF_AFTER_MS = 15 * 60_000;
const cents = (usd: number) => Math.round(usd * 100) / 100;
/** Whose budget an entry came out of; older entries were all the first household's. */
export const householdOfSpend = (r: SpendEntry): HouseholdId => r.householdId ?? FIRST_HOUSEHOLD;

/** Spent so far this month: by everyone, or by one household. Added up where the entries are, never from a list that could be cut short. */
export async function spentThisMonth(household?: HouseholdId): Promise<number> {
  const totals = await getRepo().spendTotals(monthStart());
  return cents(household ? (totals.get(household) ?? 0) : [...totals.values()].reduce((a, b) => a + b, 0));
}

/** Each household's spending so far this month. */
export async function spentByHousehold(): Promise<Map<HouseholdId, number>> {
  return new Map([...(await getRepo().spendTotals(monthStart()))].map(([id, usd]) => [id, cents(usd)]));
}

/** A household's own monthly limit, or null when only the site's budget applies (the first household, until Joel sets one). */
export function householdBudget(id: HouseholdId, household: Household | null): number | null {
  if (typeof household?.budgetUsd === 'number') return household.budgetUsd;
  return id === FIRST_HOUSEHOLD ? null : DEFAULT_HOUSEHOLD_BUDGET_USD;
}

/** Whose budget a call comes out of: the project's household, else the one this request is for, else the first. */
async function whose(projectId?: string): Promise<HouseholdId> {
  if (projectId) {
    const project = await getRepo()
      .getProject(projectId)
      .catch(() => null);
    if (project) return project.householdId ?? FIRST_HOUSEHOLD;
  }
  return currentHousehold() ?? FIRST_HOUSEHOLD;
}

const STILL_WORKS = 'Remixes and hand edits still work.';

function overBudget(spent: number, household: HouseholdId): HttpError {
  // Only the household Joel's in sees what the whole site has spent.
  if (household !== ADMIN.household) return new HttpError(402, `The studio’s AI budget for this month is used up. ${ADMIN.name} can raise it. ${STILL_WORKS}`);
  return new HttpError(402, `This month's AI budget is used up ($${spent.toFixed(2)} of $${config.monthlyBudgetUsd}). ${ADMIN.name} can raise it in Setup. ${STILL_WORKS}`);
}

function householdOver(spent: number, limit: number, household: HouseholdId): HttpError {
  const where = household === ADMIN.household ? ' in Setup' : '';
  return new HttpError(402, `Your household’s AI budget for this month is used up ($${spent.toFixed(2)} of $${limit}). ${ADMIN.name} can raise it${where}. ${STILL_WORKS}`);
}

export type Trouble = NonNullable<SpendEntry['trouble']>;
/** Records what the call really cost, and why it failed if it did. */
export type Settle = (actualUsd: number, trouble?: Trouble) => Promise<void>;

/**
 * Holds an AI call's worst-case cost against the budgets before it starts, so
 * several calls at once can't sail past a cap together. The hold is written
 * first and the totals checked after, so racing calls always see each other
 * (at worst both are refused). The household's own limit is checked first,
 * then the site's. Settle with the real cost afterwards; a hold that's never
 * settled stays at the estimate, which errs on the safe side.
 */
export async function reserveSpend(provider: string, model: string, estimateUsd: number, note: string, projectId?: string): Promise<Settle> {
  const householdId = await whose(projectId);
  if (!(estimateUsd > 0)) return (usd, trouble) => recordSpend(provider, model, usd, note, projectId, trouble, householdId);
  const repo = getRepo();
  const hold: SpendEntry = { id: newId(), at: new Date().toISOString(), provider, model, usd: round(estimateUsd), note: `${note}${IN_PROGRESS}`, projectId, householdId };
  await repo.addSpend(hold);
  const totals = await repo.spendTotals(monthStart());
  const mine = cents(totals.get(householdId) ?? 0);
  const limit = householdBudget(householdId, await getHousehold(householdId));
  const everyone = cents([...totals.values()].reduce((a, b) => a + b, 0));
  const refusal =
    limit !== null && mine > limit
      ? householdOver(Math.max(0, mine - hold.usd), limit, householdId)
      : everyone > config.monthlyBudgetUsd
        ? overBudget(Math.max(0, everyone - hold.usd), householdId)
        : null;
  if (refusal) {
    // Gone, not zeroed: a refused call leaves nothing behind to pile up.
    await repo.deleteSpend(hold.id).catch((e) => console.error('Could not release spend hold', e));
    throw refusal;
  }
  let settled = false;
  return async (actualUsd, trouble) => {
    if (settled) return;
    settled = true;
    try {
      await repo.updateSpend({ ...hold, usd: round(actualUsd), note, ...(trouble ? { trouble } : {}) });
    } catch (e) {
      console.error('Could not record spend', e);
    }
  };
}

/** Notes how a free call went (a connection test), so one that works clears an earlier failure. */
export async function recordOutcome(provider: string, model: string, note: string, trouble?: Trouble): Promise<void> {
  try {
    await getRepo().addSpend({ id: newId(), at: new Date().toISOString(), provider, model, usd: 0, note, householdId: currentHousehold() ?? FIRST_HOUSEHOLD, ...(trouble ? { trouble } : {}) });
  } catch (e) {
    console.error('Could not record the outcome', e);
  }
}

export async function recordSpend(provider: string, model: string, usd: number, note: string, projectId?: string, trouble?: Trouble, householdId?: HouseholdId): Promise<void> {
  if (!(usd > 0) && !trouble) return;
  try {
    const by = householdId ?? (await whose(projectId));
    await getRepo().addSpend({ id: newId(), at: new Date().toISOString(), provider, model, usd: round(usd), note, projectId, householdId: by, ...(trouble ? { trouble } : {}) });
  } catch (e) {
    console.error('Could not record spend', e);
  }
}

/**
 * Holds whose request was stopped before it could settle them (Vercel ending
 * a request that ran past its time, say), settled at a realistic figure so
 * they don't quietly eat a household's month at the worst-case price. A
 * painting may well have been billed, so it keeps its hold; a Claude call is
 * counted at a quarter of its hold, more than one cut short usually costs.
 * Run nightly; says how many it settled.
 */
export async function settleCutOff(now = Date.now()): Promise<number> {
  const repo = getRepo();
  let settled = 0;
  for (const r of await repo.listSpendSince(new Date(now - 32 * 86_400_000).toISOString())) {
    if (!r.note.endsWith(IN_PROGRESS) || now - Date.parse(r.at) < CUT_OFF_AFTER_MS) continue;
    await repo.updateSpend({
      ...r,
      usd: r.provider === 'anthropic' ? round(r.usd / 4) : r.usd,
      note: `${r.note.slice(0, -IN_PROGRESS.length)} (cut off)`,
      trouble: { message: 'The request was stopped before it finished.', transient: true },
    });
    settled++;
  }
  return settled;
}
