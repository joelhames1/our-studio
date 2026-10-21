import { api, body } from '@/lib/server/api';
import { findPrinters, printerState } from '@/lib/server/printers';
import { requireMember } from '@/lib/server/studio';

// A search reads several websites; give it room.
export const maxDuration = 300;

/** The order, the last ZIP searched, and the shared printer list. */
export const GET = api<{ id: string }>(async (_req, { id }) => {
  await requireMember(id);
  return printerState(id);
});

/** Printers near a ZIP code: last month's results, or a fresh web search. */
export const POST = api<{ id: string }>(async (req, { id }) => {
  const { me } = await requireMember(id);
  const { zip, refresh } = await body<{ zip?: unknown; refresh?: unknown }>(req);
  return findPrinters(me, id, zip, refresh === true);
});
