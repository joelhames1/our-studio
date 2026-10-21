import { api, body } from '@/lib/server/api';
import { approve, type ApproveInput } from '@/lib/server/decisions';
import { requireMember } from '@/lib/server/studio';

/** Erin's final "yes, this is the one". The print package is built next. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const decision = await approve(me, id, await body<ApproveInput>(req));
  return { decision };
});
