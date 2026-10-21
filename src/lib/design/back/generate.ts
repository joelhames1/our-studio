// Back options without any AI: every template that suits the occasion, then
// variations on color, lettering, layout and size.
import { PAIRINGS } from '../pairings';
import { PALETTES } from '../palettes';
import type { Rand } from '../generate';
import { BACK_TEMPLATES, backTemplate, type BackTemplate } from './templates';
import type { BackDesign, Facts, Occasion } from './types';

export function backKey(b: BackDesign): string {
  return [b.template, b.variant, b.size, b.pairing ?? '', b.palette ?? ''].join('|');
}

const pick = <T,>(arr: T[], r: Rand): T => arr[Math.floor(r() * arr.length) % arr.length];

/** Does this template have something to print with these details? */
export function hasContent(t: BackTemplate, facts: Facts): boolean {
  const people = facts.people.filter((p) => p.trim()).length;
  switch (t.id) {
    case 'flight-path':
      return facts.stops.length >= 2;
    case 'tour-dates':
      return facts.stops.length >= 1;
    case 'numbers':
      return facts.stats.length >= 2;
    case 'timeline':
      return facts.timeline.length >= 2;
    case 'coordinates':
      return !!facts.place.name.trim() || facts.place.lat != null;
    case 'crew':
      return people >= 3;
    case 'jersey':
      return people >= 1 && !!facts.bigNumber.trim();
    case 'established':
      return !!facts.year.trim();
    case 'statement':
      return !!facts.statement.trim();
  }
}

/** Templates for these occasions first, in library order, then the rest. */
export function templatesFor(occasions: Occasion[]): BackTemplate[] {
  const fits = (t: BackTemplate) => (occasions.length ? t.occasions.some((o) => occasions.includes(o)) : true);
  return [...BACK_TEMPLATES.filter(fits), ...BACK_TEMPLATES.filter((t) => !fits(t))];
}

/** One of every layout that suits the occasion, matching the front's style. */
export function starterBacks(occasions: Occasion[], facts: Facts): BackDesign[] {
  const out: BackDesign[] = [];
  for (const t of templatesFor(occasions)) {
    if (occasions.length && !t.occasions.some((o) => occasions.includes(o))) continue;
    if (!hasContent(t, facts)) continue;
    for (const v of t.variants) out.push({ template: t.id, variant: v.id, size: t.sizes[0] });
  }
  return out;
}

export interface BackGenOptions {
  occasions: Occasion[];
  facts: Facts;
  count: number;
  exclude?: Set<string>;
  rand: Rand;
  /** Only this template. */
  template?: string;
}

/** A fresh batch: layouts not seen yet, then new colors and lettering. */
export function freshBacks(o: BackGenOptions): BackDesign[] {
  const seen = new Set(o.exclude ?? []);
  const out: BackDesign[] = [];
  const pool = (o.template ? [backTemplate(o.template)] : templatesFor(o.occasions)).filter((t) => hasContent(t, o.facts));
  if (!pool.length) return out;
  // Anything in the library not shown yet comes first.
  for (const t of pool) {
    for (const v of t.variants) {
      const d: BackDesign = { template: t.id, variant: v.id, size: t.sizes[0] };
      if (out.length < o.count && !seen.has(backKey(d))) {
        seen.add(backKey(d));
        out.push(d);
      }
    }
  }
  let guard = 0;
  while (out.length < o.count && guard++ < o.count * 40) {
    const t = pick(pool.slice(0, Math.max(3, Math.ceil(pool.length / 2))), o.rand);
    const d: BackDesign = {
      template: t.id,
      variant: pick(t.variants, o.rand).id,
      size: o.rand() < 0.8 ? t.sizes[0] : pick(t.sizes, o.rand),
      palette: pick(PALETTES, o.rand).id,
      pairing: o.rand() < 0.5 ? pick(PAIRINGS, o.rand).id : undefined,
    };
    const k = backKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** "More like this": the same idea with one thing changed. */
export function similarBacks(base: BackDesign, o: Omit<BackGenOptions, 'occasions' | 'facts'>): BackDesign[] {
  const r = o.rand;
  const t = backTemplate(base.template);
  const seen = new Set(o.exclude ?? []);
  seen.add(backKey(base));
  const tweaks: (() => BackDesign)[] = [
    () => ({ ...base, variant: pick(t.variants.filter((v) => v.id !== base.variant).concat(t.variants.length === 1 ? t.variants : []), r).id }),
    () => ({ ...base, palette: pick(PALETTES.filter((p) => p.id !== base.palette), r).id }),
    () => ({ ...base, pairing: pick(PAIRINGS.filter((p) => p.id !== base.pairing), r).id }),
    () => ({ ...base, size: t.sizes.length > 1 ? (base.size === 'full' ? 'neck' : 'full') : base.size }),
    () => ({ ...base, palette: undefined, pairing: undefined }),
  ];
  const out: BackDesign[] = [];
  let guard = 0;
  let i = Math.floor(r() * tweaks.length);
  while (out.length < o.count && guard++ < o.count * 30) {
    const d = tweaks[i++ % tweaks.length]();
    const k = backKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}
