import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { cookieFrom, findInvite, INVITE_COOKIE, inviteCookie, readInviteCookie } from '@/lib/server/invites';

/**
 * Opening an invite link: says who it's from and what it's for. Only with
 * `hold` (the person pressed Continue with Google, or asked for a code) is it
 * held in this browser, with the name they gave, for the sign-in to use: just
 * opening a link someone sent you never signs you up to anything. With no
 * secret in the body, it's the one this browser is already holding.
 */
export const POST = api(async (req) => {
  const { token, name, hold } = await body<{ token?: unknown; name?: unknown; hold?: unknown }>(req);
  const held = readInviteCookie(cookieFrom(req, INVITE_COOKIE));
  const secret = typeof token === 'string' && token ? token : held?.token;
  const { view } = await findInvite(secret);
  const res = NextResponse.json({ invite: view }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  if (hold === true) res.cookies.set(inviteCookie(secret as string, typeof name === 'string' ? name : (held?.name ?? view.name)));
  return res;
});
