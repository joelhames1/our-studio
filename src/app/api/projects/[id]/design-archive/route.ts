import { api, body } from '@/lib/server/api';
import { setDesignArchived } from '@/lib/server/archive';
import { requireMember } from '@/lib/server/studio';

/** Put a design away for both of you (`archived: true`), or bring it back. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, archived } = await body<{ optionId?: unknown; archived?: unknown }>(req);
  return { option: await setDesignArchived(me, id, optionId, archived !== false) };
});
