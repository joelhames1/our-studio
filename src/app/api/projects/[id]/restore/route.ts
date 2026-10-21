import { api } from '@/lib/server/api';
import { restoreProject } from '@/lib/server/archive';
import { requireMember } from '@/lib/server/studio';

/** Bring an archived project back to the home screen. */
export const POST = api<{ id: string }>(async (_req, { id }) => {
  const { me } = await requireMember(id);
  await restoreProject(me, id);
  return { ok: true };
});
