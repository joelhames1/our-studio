import { api, body, text } from '@/lib/server/api';
import { HttpError } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { beforeAI } from '@/lib/server/consent';
import { suggestCopy } from '@/lib/server/llm/tasks';
import { getRepo } from '@/lib/server/repo';
import { contextOf, getShirtProject, projectState, requireMember } from '@/lib/server/studio';

export const maxDuration = 120;

/** Claude suggests new words; they're added to the ideas list on the Words step. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  if (!config.anthropicKey) throw new HttpError(400, 'Claude isn’t connected yet.');
  await beforeAI(me, 'claude');
  const { hint } = await body<{ hint?: unknown }>(req);
  const project = await getShirtProject(id);
  const ideas = await suggestCopy(project.brief.copy, text(hint, 300), contextOf(project));
  project.brief.copyIdeas = [...ideas, ...project.brief.copyIdeas].slice(0, 40);
  project.updatedAt = new Date().toISOString();
  await getRepo().saveProject(project);
  return projectState(id, me);
});
