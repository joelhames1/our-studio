import { api, body, idOrNull, whole } from '@/lib/server/api';
import { remixBacks, requireMember } from '@/lib/server/studio';
import { rateLimit } from '@/lib/server/limits';

/** More back ideas: { parentId } for "more like this", { template } for one kind, or neither. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  await rateLimit(me, 'free');
  const { parentId, template, count } = await body<{ parentId?: unknown; template?: unknown; count?: unknown }>(req);
  const options = await remixBacks(me, id, { parentId: idOrNull(parentId), template: idOrNull(template) ?? undefined, count: whole(count, 1, 12, 6) });
  return { options };
});
