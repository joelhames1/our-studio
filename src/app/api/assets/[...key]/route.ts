import type { User } from '@/lib/engine/types';
import { HttpError, requireUser } from '@/lib/server/auth';
import { api } from '@/lib/server/api';
import { FIRST_HOUSEHOLD } from '@/lib/server/people';
import { getRepo } from '@/lib/server/repo';
import { makePreview } from '@/lib/server/preview';
import { householdOf } from '@/lib/server/studio';
import { originalOf } from '@/lib/design/preview';

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

/** Opened on its own (an SVG, say), a stored file can't run anything or load anything. */
const FILE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

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
  // Screen-size copies of artwork: small, so served from here at an address that never changes, and kept for a
  // day (a new painting is a new address). Artwork from before they were made gets its copy on first look.
  const original = originalOf(k);
  if (original && !download) {
    let preview = await repo.getAsset(k);
    if (!preview) {
      const full = await repo.getAsset(original);
      if (!full) throw new HttpError(404, 'File not found.');
      preview = { data: await makePreview(full.data), contentType: 'image/webp' };
      await repo.putAsset(k, preview.data, 'image/webp');
    }
    return new Response(new Uint8Array(preview.data), { headers: { ...FILE_HEADERS, 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400' } });
  }
  // Big files go straight from storage (Vercel caps function responses at 4.5 MB).
  const signed = await repo.signedUrl(k, 300, download ?? undefined);
  if (signed) {
    return new Response(null, { status: 302, headers: { Location: signed, 'Cache-Control': 'private, max-age=240' } });
  }
  const asset = await repo.getAsset(k);
  if (!asset) throw new HttpError(404, 'File not found.');
  const headers: Record<string, string> = {
    ...FILE_HEADERS,
    'Content-Type': asset.contentType,
    // An hour, not forever: someone who leaves the household stops seeing its files soon after.
    'Cache-Control': 'private, max-age=3600',
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="${download.replace(/[^a-zA-Z0-9._ -]/g, '')}"`;
  return new Response(new Uint8Array(asset.data), { headers });
});
