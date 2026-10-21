// Designs come from storage, from edits and from Claude. These keep one odd
// value from breaking every page that shows it: unknown ids fall back to
// defaults, sizes stay in range, words are always three strings.
import { safeColors } from './colors';
import { LAYOUTS } from './layouts';
import type { Copy, Emphasis, LayoutId, ShirtDesign } from './types';

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
export const EMPHASES: readonly Emphasis[] = ['color', 'script', 'none'];

export const isLayout = (v: unknown): v is LayoutId => typeof v === 'string' && Object.hasOwn(LAYOUTS, v);

/** A scale inside the allowed range, or undefined for "default". */
export function safeScale(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) * 100) / 100;
}

/** Three strings of sensible length, or null if it isn't words at all. */
export function safeCopy(v: unknown): Copy | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' ? x.slice(0, 140) : '');
  return { headline: s(o.headline), tagline: s(o.tagline), extra: s(o.extra) };
}

export function safeDesign(d: ShirtDesign): ShirtDesign {
  const out: ShirtDesign = {
    ...d,
    layout: isLayout(d.layout) ? d.layout : 'stack',
    pairing: typeof d.pairing === 'string' ? d.pairing : '',
    palette: typeof d.palette === 'string' ? d.palette : '',
  };
  if (!EMPHASES.includes(d.emphasis as Emphasis)) delete out.emphasis;
  for (const k of ['shadow', 'outline'] as const) {
    if (typeof d[k] !== 'boolean') delete out[k];
  }
  for (const k of ['headlineScale', 'taglineScale', 'artScale'] as const) {
    const n = safeScale(d[k]);
    if (n === undefined) delete out[k];
    else out[k] = n;
  }
  const colors = d.colors === undefined ? undefined : safeColors(d.colors);
  if (colors) out.colors = colors;
  else delete out.colors;
  const copy = d.copyOverride === undefined ? null : safeCopy(d.copyOverride);
  if (copy) out.copyOverride = copy;
  else delete out.copyOverride;
  if (d.ticket !== undefined) {
    const t = d.ticket as Partial<Record<'from' | 'to' | 'date' | 'seats', unknown>> | null;
    const s = (x: unknown) => (typeof x === 'string' ? x.slice(0, 40) : '');
    if (t && typeof t === 'object') out.ticket = { from: s(t.from), to: s(t.to), date: s(t.date), ...(typeof t.seats === 'string' ? { seats: t.seats.slice(0, 12) } : {}) };
    else delete out.ticket;
  }
  return out;
}
