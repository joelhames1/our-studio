import { api, body } from '@/lib/server/api';
import { beforeAI } from '@/lib/server/consent';
import { tweakOption } from '@/lib/server/tweaks';
import '@/lib/server/ai';
import { requireMember } from '@/lib/server/studio';

export const maxDuration = 60;

/** Plain-English changes: "bigger words, more blue". */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, request, shirt } = await body<{ optionId: string; request: string; shirt?: string }>(req);
  await beforeAI(me, 'claude');
  return tweakOption(me, id, optionId, request, shirt);
});
