import { NextResponse } from 'next/server';
import { closeAccount } from '@/lib/server/account';
import { api, body } from '@/lib/server/api';
import { COOKIE, householdCookie, requireUser } from '@/lib/server/auth';

/** Closes your account (and with `erase`, has its data erased in 30 days), then signs this browser out. */
export const POST = api(async (req) => {
  const me = await requireUser();
  const { confirm, erase } = await body<{ confirm?: unknown; erase?: unknown }>(req);
  const { eraseAfter } = await closeAccount(me, { confirm, erase });
  const res = NextResponse.json({ ok: true, eraseAfter }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.delete(COOKIE);
  res.cookies.set(householdCookie(''));
  return res;
});
