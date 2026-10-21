import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { renamePerson } from '@/lib/server/people';

/** Changes the name everyone sees for you. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { name } = await body<{ name?: unknown }>(req);
  const person = await renamePerson(me, name);
  return { name: person.name };
});
