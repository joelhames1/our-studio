import { api, body } from '@/lib/server/api';
import { ADMIN, HttpError, requireUser } from '@/lib/server/auth';
import { setHouseholdBudget } from '@/lib/server/people';

/** Joel changes a household's monthly AI budget (null puts the default back). */
export const POST = api(async (req) => {
  const me = await requireUser();
  if (!me.admin) throw new HttpError(403, `Setup is ${ADMIN.name}’s department.`);
  const { household, usd } = await body<{ household?: unknown; usd?: unknown }>(req);
  return { household: await setHouseholdBudget(me, household, usd ?? null) };
});
