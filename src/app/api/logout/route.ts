import { NextResponse } from 'next/server';
import { fromOwnSite } from '@/lib/server/api';
import { COOKIE, currentSessionId } from '@/lib/server/auth';
import { endSession } from '@/lib/server/sessions';

export async function POST(req: Request) {
  if (!fromOwnSite(req)) return NextResponse.json({ error: 'Not here.' }, { status: 403 });
  const sid = await currentSessionId();
  if (sid) await endSession(sid);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.delete(COOKIE);
  return res;
}
