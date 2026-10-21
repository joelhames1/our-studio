import { api } from '@/lib/server/api';
import { reopen } from '@/lib/server/decisions';
import { projectState, requireMember } from '@/lib/server/studio';

/** "Changed my mind": back to exploring. The old print files stay in storage. */
export const POST = api<{ id: string }>(async (_req, { id }) => {
  const { me } = await requireMember(id);
  await reopen(me, id);
  return projectState(id, me);
});
