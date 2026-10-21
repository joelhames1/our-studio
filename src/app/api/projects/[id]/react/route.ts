import { api, body, idOrNull } from '@/lib/server/api';
import { HttpError } from '@/lib/server/auth';
import { react, requireMember } from '@/lib/server/studio';

export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { optionId, value, note } = await body<{ optionId?: unknown; value?: unknown; note?: unknown }>(req);
  const choice = value === null ? null : (['love', 'maybe', 'pass'] as const).find((v) => v === value);
  if (choice === undefined) throw new HttpError(400, 'Bad reaction.');
  const option = idOrNull(optionId);
  if (!option) throw new HttpError(404, 'That design is gone.');
  return { reaction: await react(me, id, option, choice, typeof note === 'string' ? note : undefined) };
});
