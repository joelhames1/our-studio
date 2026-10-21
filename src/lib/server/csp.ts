// The Content Security Policy every page is served with. Scripts only run if
// they carry this request's nonce (Next.js adds it to its own), so even if
// something slipped markup into a page, it couldn't run code, phone home, or
// be framed by another site.

/** Where Supabase serves signed downloads from, if it's connected. */
function storageOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; https: boolean; supabaseUrl?: string }): string {
  const storage = storageOrigin(opts.supabaseUrl);
  const media = ["'self'", 'blob:', 'data:', ...(storage ? [storage] : [])];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'unsafe-eval' only for next dev, which uses eval for error overlays.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are everywhere (React style props, SVG previews). Styles can't run code.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': media,
    'connect-src': [...media, ...(opts.dev ? ['ws:', 'wss:'] : [])],
    'font-src': ["'self'", 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'manifest-src': ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (opts.https) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}
