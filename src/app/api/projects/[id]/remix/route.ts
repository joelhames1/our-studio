import { api, body, idOrNull, whole } from '@/lib/server/api';
import { remix, requireMember } from '@/lib/server/studio';
import { rateLimit } from '@/lib/server/limits';

/** Instant, free variations: { parentId } for "more like this", or none for fresh ideas. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  await rateLimit(me, 'free');
  const { parentId, count } = await body<{ parentId?: unknown; count?: unknown }>(req);
  const options = await remix(me, id, idOrNull(parentId), whole(count, 1, 12, 6));
  return { options };
});
