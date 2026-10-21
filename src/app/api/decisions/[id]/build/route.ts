import { api } from '@/lib/server/api';
import { HttpError } from '@/lib/server/auth';
import { buildPackage } from '@/lib/server/decisions';
import { beforeAI } from '@/lib/server/consent';
import { getRepo } from '@/lib/server/repo';
import { requireMember } from '@/lib/server/studio';

// Upscaling artwork and rendering 300 DPI files can take a little while.
export const maxDuration = 300;

export const POST = api<{ id: string }>(async (_req, { id }) => {
  const decision = await getRepo().getDecision(id);
  if (!decision) throw new HttpError(404, 'That approval is gone.');
  const { me } = await requireMember(decision.projectId);
  await beforeAI(me, 'build');
  return { decision: await buildPackage(id) };
});
