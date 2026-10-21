import { api, body, idOrNull } from '@/lib/server/api';
import { editBack, tweakBack } from '@/lib/server/backs';
import { beforeAI } from '@/lib/server/consent';
import type { BackDesign } from '@/lib/design/back/types';
import { requireMember } from '@/lib/server/studio';
import { rateLimit } from '@/lib/server/limits';

/** Change a back: { optionId, patch } for direct edits, { optionId, request } for plain English. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  await rateLimit(me, 'free');
  const { optionId, patch, request } = await body<{ optionId?: unknown; patch?: unknown; request?: unknown }>(req);
  const option = idOrNull(optionId) ?? '';
  if (typeof request === 'string') {
    await beforeAI(me, 'claude');
    return tweakBack(me, id, option, request);
  }
  const changes = patch && typeof patch === 'object' && !Array.isArray(patch) ? (patch as Partial<Record<keyof BackDesign, unknown>>) : {};
  return editBack(me, id, option, changes);
});
