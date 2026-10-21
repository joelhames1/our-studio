import { api } from '@/lib/server/api';
import { archiveProject } from '@/lib/server/archive';
import { requireMember } from '@/lib/server/studio';

/** Hide a project from the home screen. */
export const POST = api<{ id: string }>(async (_req, { id }) => {
  const { me } = await requireMember(id);
  await archiveProject(me, id);
  return { ok: true };
});
