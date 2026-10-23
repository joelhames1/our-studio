import { NextResponse, type NextRequest } from 'next/server';
import { record } from '@/lib/server/activity';
import { householdCookie, startSession } from '@/lib/server/auth';
import { finishGoogle, NEXT_COOKIE, nextCookie, PKCE_COOKIE, refused, verifierCookie } from '@/lib/server/google';
import { safeNext } from '@/lib/engine/paths';
import { INVITE_COOKIE, inviteCookie } from '@/lib/server/invites';

/** Back from Google: one of us (or someone with an invite) gets a session; anyone else goes back to the welcome screen with the reason. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get('error');
  const result = error
    ? error === 'access_denied'
      ? 'cancelled'
      : 'failed'
    : await finishGoogle(url.searchParams.get('code'), req.cookies.get(PKCE_COOKIE)?.value, url.origin, req.cookies.get(INVITE_COOKIE)?.value);
  if (error && error !== 'access_denied') console.error('Google sign-in came back with', error, url.searchParams.get('error_description')?.slice(0, 300));
  const next = safeNext(req.cookies.get(NEXT_COOKIE)?.value) ?? '/';
  const res = typeof result === 'string' ? refused(url.origin, result) : NextResponse.redirect(new URL(next, url.origin), 303);
  const invited = !!req.cookies.get(INVITE_COOKIE)?.value;
  if (typeof result !== 'string') {
    res.cookies.set(await startSession(result.id, req, 'Google'));
    // Someone who just joined a household starts out working in it.
    if (invited) res.cookies.set(householdCookie(result.household));
    await record(result, 'signed-in', { detail: 'with Google' });
  }
  if (invited) res.cookies.set(inviteCookie(''));
  // The verifier is single-use, and the code in this address shouldn't follow you anywhere.
  res.cookies.set(verifierCookie(''));
  res.cookies.set(nextCookie(''));
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
