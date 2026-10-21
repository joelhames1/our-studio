import { NextResponse } from 'next/server';
import { api, body } from '@/lib/server/api';
import { codeCookie, sendCode } from '@/lib/server/codes';
import { cookieFrom, INVITE_COOKIE } from '@/lib/server/invites';
import { networkOf } from '@/lib/server/limits';

/** "Email me a code": sends one if the address is on the list (or this browser holds an invite), and leaves this browser holding its signature. */
export const POST = api(async (req) => {
  const { email } = await body<{ email?: unknown }>(req);
  const { cookie, to } = await sendCode(email, Date.now(), cookieFrom(req, INVITE_COOKIE), networkOf(req));
  const res = NextResponse.json({ ok: true, to }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(codeCookie(cookie));
  return res;
});
