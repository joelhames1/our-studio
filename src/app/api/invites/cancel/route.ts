import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { cancelInvite } from '@/lib/server/invites';

/** Takes back an invite nobody has used yet. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { id } = await body<{ id?: unknown }>(req);
  await cancelInvite(me, id);
  return { ok: true };
});
