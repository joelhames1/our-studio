// Server errors outside the API routes (a page that crashes while it renders,
// say) come through here, so they get the same alert email as the API's own.
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : '';
  // Redirects and not-found pages travel as errors too; they aren't problems.
  if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest)) return;
  const { sendAlert } = await import('@/lib/server/alerts');
  // The path without its query string: a sign-in code, say, has no business in an email.
  const where = `${request.method} ${request.path.split('?')[0]}`;
  await sendAlert('server', [
    `A page failed while ${context.routeType === 'render' ? 'loading' : 'running'} (${where}).`,
    `Error: ${err instanceof Error ? err.message : String(err)}${digest ? ` (digest ${digest})` : ''}`,
  ]);
};
