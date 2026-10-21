import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { householdCookie, requireUser } from '@/lib/server/auth';
import { acceptInvite, cookieFrom, INVITE_COOKIE, inviteCookie, readInviteCookie } from '@/lib/server/invites';

/** Someone already signed in uses an invite (from the body, or the one this browser opened), and starts working in the household it's for. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { token } = await body<{ token?: unknown }>(req);
  const secret = typeof token === 'string' && token ? token : readInviteCookie(cookieFrom(req, INVITE_COOKIE))?.token;
  const user = await acceptInvite(secret, { user: me });
  const res = NextResponse.json({ ok: true, household: user.household }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(householdCookie(user.household));
  res.cookies.set(inviteCookie(''));
  return res;
});
