import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { HttpError, householdCookie, requireUser } from '@/lib/server/auth';

/** For people in more than one household: which one this browser works in. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { household } = await body<{ household?: unknown }>(req);
  if (typeof household !== 'string' || !me.households.includes(household)) throw new HttpError(404, 'You’re not in that household.');
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(householdCookie(household));
  return res;
});
