import { NextResponse } from 'next/server';
import { record } from '@/lib/server/activity';
import { api, body } from '@/lib/server/api';
import { householdCookie, startSession } from '@/lib/server/auth';
import { checkCode, CODE_COOKIE, codeCookie } from '@/lib/server/codes';
import { cookieFrom, INVITE_COOKIE, inviteCookie } from '@/lib/server/invites';

/** The six digits from the email, traded for the usual signed session on this device. */
export const POST = api(async (req) => {
  const { code } = await body<{ code?: unknown }>(req);
  // Their values are all letters, digits, dots, dashes and underscores, so they need no decoding.
  const invite = cookieFrom(req, INVITE_COOKIE);
  const user = await checkCode(cookieFrom(req, CODE_COOKIE), code, Date.now(), invite);
  const res = NextResponse.json({ ok: true, name: user.name }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(await startSession(user.id, req, 'an email code'));
  res.cookies.set(codeCookie(''));
  if (invite) {
    // Someone who just joined a household starts out working in it.
    res.cookies.set(householdCookie(user.household));
    res.cookies.set(inviteCookie(''));
  }
  await record(user, 'signed-in', { detail: 'with an email code' });
  return res;
});
