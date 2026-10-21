import { api, body, idOrNull, text } from '@/lib/server/api';
import { generateArtOptions } from '@/lib/server/art';
import { beforeAI } from '@/lib/server/consent';
import { requireMember } from '@/lib/server/studio';

export const maxDuration = 300;

/** New AI artwork, turned into a few new designs. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { idea, basedOn } = await body<{ idea?: unknown; basedOn?: unknown }>(req);
  await beforeAI(me, 'art');
  const from = idOrNull(basedOn);
  const options = await generateArtOptions(me, id, { idea: text(idea, 300) || undefined, basedOn: from, count: from ? 2 : 3 });
  return { options };
});
