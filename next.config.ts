import type { NextConfig } from 'next';

/** Sent with every response. The page CSP itself is set per request in src/proxy.ts. */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HTTPS only, for two years, on this host and anything under it. Browsers ignore it over plain
  // http, so local development is unaffected. Not "preload": that would bind the whole domain.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // A private app: keep it out of search engines entirely.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native modules used for the print export; keep them out of the bundle.
  serverExternalPackages: ['@resvg/resvg-js', 'sharp'],
  // The server reads the shirt fonts from disk when rendering print files.
  outputFileTracingIncludes: {
    '/**/*': ['./public/fonts/**/*', './supabase/migrations/*.sql'],
  },
  // Vercel runs on glibc Linux, so the musl and WebAssembly builds of those two never load there.
  // Left in, they're nearly half of every deployment's functions, which the free plan caps.
  outputFileTracingExcludes: {
    '/**/*': [
      './node_modules/@img/sharp-libvips-linuxmusl-x64/**/*',
      './node_modules/@img/sharp-linuxmusl-x64/**/*',
      './node_modules/@img/sharp-wasm32/**/*',
      './node_modules/@resvg/resvg-js-linux-x64-musl/**/*',
    ],
  },
  async headers() {
    // Pages whose address carries something private (a printer link, an invite, a sign-in link) send
    // no address at all when they load or link to anything; later rules win over the first.
    const quiet = ['/s/:path*', '/join', '/join/:path*', '/k', '/k/:path*', '/api/auth/:path*'];
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...quiet.map((source) => ({ source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] })),
    ];
  },
};

export default nextConfig;
