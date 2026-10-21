import { api } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { markWelcomed } from '@/lib/server/people';

/** "Got it" on the welcome: it stops showing, on every device. */
export const POST = api(async () => {
  const me = await requireUser();
  await markWelcomed(me);
  return { ok: true };
});
