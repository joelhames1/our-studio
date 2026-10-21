import { api, body } from '@/lib/server/api';
import { editOption } from '@/lib/server/tweaks';
import { requireMember } from '@/lib/server/studio';

export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, patch } = await body<{ optionId: string; patch: unknown }>(req);
  return editOption(me, id, optionId, patch);
});
