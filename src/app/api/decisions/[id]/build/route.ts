import { api } from '@/lib/server/api';
import { HttpError, requireUser } from '@/lib/server/auth';
import { buildPackage } from '@/lib/server/decisions';
import { beforeAI } from '@/lib/server/consent';
import { getRepo } from '@/lib/server/repo';
import { requireMember } from '@/lib/server/studio';

// Upscaling artwork and rendering 300 DPI files can take a little while.
export const maxDuration = 300;

const gone = () => new HttpError(404, 'That approval is gone.');

export const POST = api<{ id: string }>(async (_req, { id }) => {
  // Signed in first, and the same answer for an approval that's missing as for one that's someone else's.
  await requireUser();
  const decision = await getRepo().getDecision(id);
  if (!decision) throw gone();
  const { me } = await requireMember(decision.projectId).catch((e: unknown) => {
    throw e instanceof HttpError && e.status === 404 ? gone() : e;
  });
  await beforeAI(me, 'build');
  return { decision: await buildPackage(id) };
});
