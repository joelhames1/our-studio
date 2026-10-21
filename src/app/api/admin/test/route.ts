import { api, body } from '@/lib/server/api';
import { ADMIN, HttpError, requireUser } from '@/lib/server/auth';
import { testConnection, type TestTarget } from '@/lib/server/setup';

export const maxDuration = 60;

export const POST = api(async (req) => {
  const me = await requireUser();
  if (!me.admin) throw new HttpError(403, `Setup is ${ADMIN.name}’s department.`);
  const { target } = await body<{ target: TestTarget }>(req);
  if (!['claude', 'art', 'storage', 'alert', 'backup'].includes(target)) throw new HttpError(400, 'Test what?');
  try {
    return { ok: true, message: await testConnection(target) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
});
