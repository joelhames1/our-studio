import { NextResponse } from 'next/server';
import { fromOwnSite } from '@/lib/server/api';
import { COOKIE, currentSessionId, HOUSEHOLD_COOKIE } from '@/lib/server/auth';
import { INVITE_COOKIE } from '@/lib/server/invites';
import { endSession } from '@/lib/server/sessions';

export async function POST(req: Request) {
  if (!fromOwnSite(req)) return NextResponse.json({ error: 'Not here.' }, { status: 403 });
  const sid = await currentSessionId();
  if (sid) await endSession(sid);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  // Nothing of this browser's stays behind: which household it was in, or an invite it was holding.
  for (const name of [COOKIE, HOUSEHOLD_COOKIE, INVITE_COOKIE]) res.cookies.delete(name);
  return res;
}
