import { api, body } from '@/lib/server/api';
import { HttpError } from '@/lib/server/auth';
import { react, requireMember } from '@/lib/server/studio';
import type { ReactionValue } from '@/lib/engine/types';

export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, value, note } = await body<{ optionId: string; value: ReactionValue | null; note?: string }>(req);
  if (value !== null && !['love', 'maybe', 'pass'].includes(value)) throw new HttpError(400, 'Bad reaction.');
  return { reaction: await react(me, id, optionId, value, note) };
});
