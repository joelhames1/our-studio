import { record } from '@/lib/server/activity';
import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { getHousehold, renameHousehold } from '@/lib/server/people';

/** The owner renames the household. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { name } = await body<{ name?: unknown }>(req);
  const before = await getHousehold(me.household);
  const household = await renameHousehold(me, name);
  if (before && before.name !== household.name) await record(me, 'household-renamed', { detail: `was “${before.name}”` });
  return { household };
});
