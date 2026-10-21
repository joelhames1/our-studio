import { api, body } from '@/lib/server/api';
import { beforeAI } from '@/lib/server/consent';
import { tweakOption } from '@/lib/server/tweaks';
import '@/lib/server/ai';
import { requireMember } from '@/lib/server/studio';

// Claude gets 20 s before keywords take over; a tweak that asks for new artwork also paints and checks it.
export const maxDuration = 300;

/** Plain-English changes: "bigger words, more blue". */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, request, shirt } = await body<{ optionId?: unknown; request?: unknown; shirt?: unknown }>(req);
  await beforeAI(me, 'claude');
  return tweakOption(me, id, optionId, request, shirt);
});
