import { api, body } from '@/lib/server/api';
import { type BriefPatch, projectState, requireMember, updateBrief } from '@/lib/server/studio';

export const GET = api<{ id: string }>(async (_req, { id }) => {
  const { me } = await requireMember(id);
  return projectState(id, me);
});

/** Update the words, the chosen vibes, or the back's details. */
export const PATCH = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const patch = await body<BriefPatch>(req);
  await updateBrief(id, patch);
  return projectState(id, me);
});
