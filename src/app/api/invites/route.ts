import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { createInvite } from '@/lib/server/invites';

/** A new invite link: into your household (its owner), or to start a new one (whoever runs the site). */
export const POST = api(async (req) => {
  const me = await requireUser();
  const input = await body<{ kind?: unknown; name?: unknown; household?: unknown }>(req);
  const { invite, link } = await createInvite(me, input, new URL(req.url).origin);
  return { link, invite: { id: invite.id, kind: invite.kind, name: invite.name, householdName: invite.householdName, expiresAt: invite.expiresAt } };
});
