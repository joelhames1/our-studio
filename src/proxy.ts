// Runs before every page: makes a fresh nonce and sends the page's Content
// Security Policy with it (see lib/server/csp.ts).
import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/server/csp';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === 'development',
    https: !!process.env.VERCEL,
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, build output, public files and printer-link files (which send their own, stricter policy) don't need it.
      source: '/((?!api/|_next/static|_next/image|fonts/|favicon.ico|icon.svg|apple-touch-icon.png|manifest.webmanifest|s/[^/]+/f/).*)',
      // The app's own prefetches are data, not pages. A browser's prefetch ("Purpose: prefetch") is a whole
      // page it may show later, so that one still gets a policy.
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
