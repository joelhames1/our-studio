import { api, body } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';
import { removePrinter, updatePrinter } from '@/lib/server/printers';

/** Shortlist a printer on your household's list, mark it used, or keep a note. */
export const PATCH = api<{ printerId: string }>(async (req, { printerId }) => {
  const me = await requireUser();
  const patch = await body<{ status?: unknown; note?: unknown }>(req);
  return { printer: await updatePrinter(me.household, printerId, patch) };
});

export const DELETE = api<{ printerId: string }>(async (_req, { printerId }) => {
  const me = await requireUser();
  await removePrinter(me.household, printerId);
  return { ok: true };
});
