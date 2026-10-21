import { api } from '@/lib/server/api';
import { HttpError } from '@/lib/server/auth';
import { openShare } from '@/lib/server/printers';
import { getRepo } from '@/lib/server/repo';

/** One file from a printer link. Checks the link every time, so turning it off works at once. */
export const GET = api<{ token: string; index: string }>(async (req, { token, index }) => {
  const opened = await openShare(token);
  const file = opened?.decision.files?.[Number(index)];
  if (!opened || !file || !/^\d{1,3}$/.test(index)) throw new HttpError(404, 'This link has expired or been turned off.');
  const download = new URL(req.url).searchParams.has('download') ? file.name.split('/').pop()! : undefined;
  const repo = getRepo();
  const signed = await repo.signedUrl(file.key, 300, download);
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (signed) return new Response(null, { status: 302, headers: { ...headers, Location: signed } });
  const asset = await repo.getAsset(file.key);
  if (!asset) throw new HttpError(404, 'File not found.');
  return new Response(new Uint8Array(asset.data), {
    headers: {
      ...headers,
      'Content-Type': asset.contentType,
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      ...(download ? { 'Content-Disposition': `attachment; filename="${download.replace(/[^a-zA-Z0-9._ -]/g, '')}"` } : {}),
    },
  });
});
