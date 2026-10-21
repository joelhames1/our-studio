import { api, body } from '@/lib/server/api';
import { editBack, tweakBack } from '@/lib/server/backs';
import { beforeAI } from '@/lib/server/consent';
import type { BackDesign } from '@/lib/design/back/types';
import { requireMember } from '@/lib/server/studio';
import { rateLimit } from '@/lib/server/limits';

/** Change a back: { optionId, patch } for direct edits, { optionId, request } for plain English. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  await rateLimit(me, 'free');
  const { optionId, patch, request } = await body<{ optionId: string; patch?: Partial<Record<keyof BackDesign, unknown>>; request?: string }>(req);
  if (typeof request === 'string') {
    await beforeAI(me, 'claude');
    return tweakBack(me, id, optionId, request);
  }
  return editBack(me, id, optionId, patch ?? {});
});
