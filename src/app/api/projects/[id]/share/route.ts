import { api, body } from '@/lib/server/api';
import { createShare, revokeShares } from '@/lib/server/printers';
import { requireMember } from '@/lib/server/studio';

/** A link a printer can open without signing in. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { printerId } = await body<{ printerId?: unknown }>(req);
  const { token, share } = await createShare(me, id, printerId);
  return { url: `${new URL(req.url).origin}/s/${token}`, share };
});

/** Turns off one link ({ hash }) or all of them. */
export const DELETE = api<{ id: string }>(async (req, { id }) => {
  await requireMember(id);
  const { hash } = await body<{ hash?: unknown }>(req);
  await revokeShares(id, hash);
  return { ok: true };
});
