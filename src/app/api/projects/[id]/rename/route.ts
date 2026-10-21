import { api, body } from '@/lib/server/api';
import { renameProject } from '@/lib/server/archive';
import { requireMember } from '@/lib/server/studio';

export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { title } = await body<{ title?: unknown }>(req);
  const project = await renameProject(me, id, title);
  return { title: project.title };
});
