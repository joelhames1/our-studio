import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { currentSessionId, HttpError, requireUser, sessionCookie } from '@/lib/server/auth';
import { signOutDevice, signOutEverywhere } from '@/lib/server/sessions';

/** Signs out one of your other browsers, or every one but this. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { action, id } = await body<{ action?: unknown; id?: unknown }>(req);
  const here = await currentSessionId();
  if (action === 'everywhere') {
    const at = await signOutEverywhere(me, here);
    const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    // This browser stays signed in, with a cookie from after the cutoff.
    res.cookies.set(sessionCookie(me.id, here, at));
    return res;
  }
  if (here && id === here) throw new HttpError(400, 'That’s this browser. Use Sign out instead.');
  await signOutDevice(me, id);
  return { ok: true };
});
