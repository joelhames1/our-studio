import { api, body } from '@/lib/server/api';
import { eraseEmptyHousehold, eraseNow, keepData, restore, switchOff } from '@/lib/server/account';
import { makeOwner } from '@/lib/server/membership';
import { HttpError, requireUser } from '@/lib/server/auth';

/** Joel's people tools on Setup: switch an account off, restore it, keep its data, or erase it (or an empty household); give an ownerless household an owner. */
export const POST = api(async (req) => {
  const me = await requireUser();
  if (!me.admin) throw new HttpError(403, 'Only whoever runs the site can do that.');
  const { action, person, household, confirm } = await body<{ action?: unknown; person?: unknown; household?: unknown; confirm?: unknown }>(req);
  if (action === 'switch-off') await switchOff(me, person);
  else if (action === 'restore') await restore(me, person);
  else if (action === 'keep') await keepData(me, person);
  else if (action === 'erase') await eraseNow(me, person, confirm);
  else if (action === 'erase-household') await eraseEmptyHousehold(me, household, confirm);
  else if (action === 'make-owner') await makeOwner(me, household, person);
  else throw new HttpError(400, 'Do what?');
  return { ok: true };
});
