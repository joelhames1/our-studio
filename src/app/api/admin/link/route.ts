import { api, body } from '@/lib/server/api';
import { ADMIN, HttpError, requireUser } from '@/lib/server/auth';
import { personalLink } from '@/lib/server/setup';

/** Joel's copy button: the full link, fetched only when he taps it. */
export const POST = api(async (req) => {
  const me = await requireUser();
  if (!me.admin) throw new HttpError(403, `Setup is ${ADMIN.name}’s department.`);
  const { who } = await body<{ who?: unknown }>(req);
  if (who !== 'erin' && who !== 'joel') throw new HttpError(400, 'Whose link?');
  const link = personalLink(new URL(req.url).origin, who);
  if (!link) throw new HttpError(404, 'That link isn’t set up yet.');
  return { link };
});
