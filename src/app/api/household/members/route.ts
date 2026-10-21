import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { removeMember, setRole } from '@/lib/server/membership';

/** An owner changes someone's part in the household, or takes them out of it. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { person, action } = await body<{ person?: unknown; action?: unknown }>(req);
  if (action === 'remove') await removeMember(me, person);
  else await setRole(me, person, action);
  return { ok: true };
});
