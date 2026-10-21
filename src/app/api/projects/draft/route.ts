import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { beforeAI } from '@/lib/server/consent';
import { draftFromSentence } from '@/lib/server/projects';

export const maxDuration = 120;

/** Claude fills in the new-project form from one sentence. Nothing is saved. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { text } = await body<{ text?: string }>(req);
  await beforeAI(me, 'claude');
  return { draft: await draftFromSentence(String(text ?? '').slice(0, 600)) };
});
