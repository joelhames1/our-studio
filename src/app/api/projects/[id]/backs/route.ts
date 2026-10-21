import { api, body } from '@/lib/server/api';
import { remixBacks, requireMember } from '@/lib/server/studio';

/** More back ideas: { parentId } for "more like this", { template } for one kind, or neither. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { parentId, template, count } = await body<{ parentId?: string | null; template?: string; count?: number }>(req);
  const options = await remixBacks(me, id, { parentId, template, count });
  return { options };
});
