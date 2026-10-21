import { NextResponse } from 'next/server';
import { fromOwnSite } from '@/lib/server/api';
import { startSession } from '@/lib/server/auth';
import { config } from '@/lib/server/config';

/** Local-only "who are you?" picker, for running on a laptop before links are set up. */
export async function POST(req: Request) {
  if (!config.devLogin || !fromOwnSite(req)) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  const form = await req.formData();
  const who = form.get('who') === 'joel' ? 'joel' : 'erin';
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(await startSession(who, req, 'the laptop picker'));
  return res;
}
