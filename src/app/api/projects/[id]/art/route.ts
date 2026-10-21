import { api, body } from '@/lib/server/api';
import { generateArtOptions } from '@/lib/server/art';
import { beforeAI } from '@/lib/server/consent';
import { requireMember } from '@/lib/server/studio';

export const maxDuration = 300;

/** New AI artwork, turned into a few new designs. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { idea, basedOn } = await body<{ idea?: string; basedOn?: string | null }>(req);
  await beforeAI(me, 'art');
  const options = await generateArtOptions(me, id, { idea: idea?.slice(0, 300), basedOn: basedOn ?? null, count: basedOn ? 2 : 3 });
  return { options };
});
