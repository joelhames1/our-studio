import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { cookieFrom, findInvite, INVITE_COOKIE, inviteCookie, readInviteCookie } from '@/lib/server/invites';

/**
 * Opening an invite link: says who it's from and what it's for, and holds it
 * (with the name you give) in this browser while you sign in. With no secret
 * in the body, it's the one this browser is already holding, so a reload works.
 */
export const POST = api(async (req) => {
  const { token, name } = await body<{ token?: unknown; name?: unknown }>(req);
  const held = readInviteCookie(cookieFrom(req, INVITE_COOKIE));
  const secret = typeof token === 'string' && token ? token : held?.token;
  const { view } = await findInvite(secret);
  const res = NextResponse.json({ invite: view }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  res.cookies.set(inviteCookie(secret as string, typeof name === 'string' ? name : (held?.name ?? view.name)));
  return res;
});
