import { api } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { agree } from '@/lib/server/consent';

/** "OK, let's start" on the welcome screen: records that you agree to how Our Studio uses AI. */
export const POST = api(async () => {
  await agree(await requireUser());
});
