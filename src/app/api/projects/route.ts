import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { archivedCount, projectSummaries } from '@/lib/server/overview';
import { rateLimit } from '@/lib/server/limits';
import { markWelcomed } from '@/lib/server/people';
import { createProject, type NewProjectInput } from '@/lib/server/projects';

/** The desktop sidebar's list: each project, what's new in it, and a design to show. */
export const GET = api(async () => {
  const me = await requireUser();
  const [list, archived] = await Promise.all([projectSummaries(me), archivedCount(me)]);
  return {
    archived,
    projects: list.map(({ project, unseen, theyLoved, pick, shirt }) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      unseen,
      theyLoved,
      pick: pick ? { design: pick.payload, copy: pick.payload.copyOverride ?? project.brief.copy } : null,
      shirt,
    })),
  };
});

/** Start a new project: { occasion, basics, copy, copyIdeas?, context?, facts? }. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const input = await body<NewProjectInput>(req);
  await rateLimit(me, 'create');
  const project = await createProject(me, input);
  // Starting something means they've got the idea: the welcome can go.
  await markWelcomed(me).catch((e) => console.error('Couldn’t note the welcome as seen:', (e as Error).message));
  return { project };
});
