import { NextResponse } from 'next/server';
import { config } from '@/lib/server/config';
import { nextCookie, refused, startGoogle, verifierCookie } from '@/lib/server/google';
import { safeNext } from '@/lib/engine/paths';

/** "Continue with Google": off to Google (or Supabase, then Google), holding a one-time verifier for the way back. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!config.googleSignIn) return refused(origin, 'off');
  const { url, verifier } = startGoogle(origin);
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(verifierCookie(verifier));
  // Where they were headed before signing in, for the way back.
  res.cookies.set(nextCookie(safeNext(new URL(req.url).searchParams.get('next')) ?? ''));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
