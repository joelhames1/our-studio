import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { householdCookie, requireUser } from '@/lib/server/auth';
import { leaveHousehold } from '@/lib/server/membership';

/** Leaves a household (the one you're working in, unless you say which). */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { household } = await body<{ household?: unknown }>(req);
  const which = typeof household === 'string' && household ? household : me.household;
  await leaveHousehold(me, which);
  const res = NextResponse.json({ ok: true, signedOut: me.households.length === 1 }, { headers: { 'Cache-Control': 'no-store' } });
  // Back to whichever household is left (or signed out, if that was the only one).
  if (which === me.household) res.cookies.set(householdCookie(''));
  return res;
});
