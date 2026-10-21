import { NextResponse } from 'next/server';
import { record } from '@/lib/server/activity';
import { api, body } from '@/lib/server/api';
import { HttpError, startSession, userForLinkToken } from '@/lib/server/auth';
import { config } from '@/lib/server/config';

/** Trades a personal link's token for a signed session on this device. */
export const POST = api(async (req) => {
  if (config.linksOff) throw new HttpError(410, 'Personal links are turned off. Sign in with Google instead.');
  const { token } = await body<{ token?: unknown }>(req);
  const user = await userForLinkToken(token);
  if (!user) throw new HttpError(401, 'That link didn’t work.');
  const res = NextResponse.json({ ok: true, name: user.name }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(await startSession(user.id, req, 'a personal link'));
  await record(user, 'signed-in', { detail: 'with a personal link' });
  return res;
});
