import { api, body } from '@/lib/server/api';
import { deleteProject } from '@/lib/server/archive';
import { requireMember } from '@/lib/server/studio';

/** Gone for good. Only for archived projects, with the name typed out as `confirm`. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { confirm } = await body<{ confirm?: unknown }>(req);
  await deleteProject(me, id, confirm);
  return { ok: true };
});
