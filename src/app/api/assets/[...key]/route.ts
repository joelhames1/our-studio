import type { User } from '@/lib/engine/types';
import { HttpError, requireUser } from '@/lib/server/auth';
import { api } from '@/lib/server/api';
import { FIRST_HOUSEHOLD } from '@/lib/server/people';
import { getRepo } from '@/lib/server/repo';
import { householdOf } from '@/lib/server/studio';

/**
 * Whether `user` may open a stored file. Artwork lives in a folder per
 * household (art/<household>/…; art/<file> from before households is the
 * first household's), and print files under the approval they were made for.
 * Anything else (the nightly backups, say) is never served.
 */
async function mayOpen(user: User, key: string): Promise<boolean> {
  const art = /^art\/(?:([a-z0-9-]+)\/)?[^/]+$/.exec(key);
  if (art) return user.households.includes(art[1] ?? FIRST_HOUSEHOLD);
  const files = /^decisions\/([^/]+)\//.exec(key);
  if (files) {
    const repo = getRepo();
    const decision = await repo.getDecision(files[1]);
    const project = decision ? await repo.getProject(decision.projectId) : null;
    return !!project && user.households.includes(householdOf(project));
  }
  return false;
}

/** Serves stored images and print files to the household they belong to. */
export const GET = api<{ key: string[] }>(async (req, { key }) => {
  const me = await requireUser();
  let k: string;
  try {
    k = key.map(decodeURIComponent).join('/');
  } catch {
    throw new HttpError(400, 'Bad file name.');
  }
  if (!/^[a-z0-9/_.-]+$/i.test(k) || k.includes('..') || k.length > 300) throw new HttpError(400, 'Bad file name.');
  // Someone else's file looks exactly like a missing one.
  if (!(await mayOpen(me, k))) throw new HttpError(404, 'File not found.');
  const repo = getRepo();
  const url = new URL(req.url);
  const download = url.searchParams.get('download')?.slice(0, 120) ?? null;
  // Big files go straight from storage (Vercel caps function responses at 4.5 MB).
  const signed = await repo.signedUrl(k, 300, download ?? undefined);
  if (signed) {
    return new Response(null, { status: 302, headers: { Location: signed, 'Cache-Control': 'private, max-age=240' } });
  }
  const asset = await repo.getAsset(k);
  if (!asset) throw new HttpError(404, 'File not found.');
  const headers: Record<string, string> = {
    'Content-Type': asset.contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    // Opened on its own (an SVG, say), a stored file can't run anything or load anything.
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="${download.replace(/[^a-zA-Z0-9._ -]/g, '')}"`;
  return new Response(new Uint8Array(asset.data), { headers });
});
