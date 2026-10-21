import { api, body } from '@/lib/server/api';
import { remix, requireMember } from '@/lib/server/studio';

/** Instant, free variations: { parentId } for "more like this", or none for fresh ideas. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { parentId, count } = await body<{ parentId?: string | null; count?: number }>(req);
  const options = await remix(me, id, parentId ?? null, Math.min(Math.max(count ?? 6, 1), 12));
  return { options };
});
