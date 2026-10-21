import { api, body } from '@/lib/server/api';
import { projectState, requireMember, setApprover } from '@/lib/server/studio';

/** Hands the final say to someone else in the household: { approver: personId }. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { approver } = await body<{ approver?: unknown }>(req);
  await setApprover(me, id, approver);
  return projectState(id, me);
});
