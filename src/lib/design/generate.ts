// Zero-AI design generator: mixes layouts, type pairings, palettes and artwork
// within the chosen vibes. Instant and free, so Erin never waits on a remix.
import type { Occasion } from './back/types';
import { motifsFor } from './occasions';
import { PAIRINGS } from './pairings';
import { PALETTES } from './palettes';
import type { ArtRef, LayoutId, MotifId, ShirtDesign } from './types';
import { vibe as getVibe, vibesFor, type Vibe } from './vibes';

export type Rand = () => number;

/** Small seeded PRNG (mulberry32) so tests and remixes are reproducible. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(arr: T[], r: Rand): T => arr[Math.floor(r() * arr.length) % arr.length];

export function artKey(art: ArtRef): string {
  if (art.kind === 'motif') return `m:${art.motif}${art.line ? ':line' : ''}`;
  if (art.kind === 'none') return 'none';
  return `${art.kind}:${art.assetKey}`;
}

/** Identity of a design, for de-duplication. */
export function designKey(d: ShirtDesign): string {
  const colors = d.colors ? Object.entries(d.colors).sort().join(',') : '';
  return [d.layout, d.pairing, d.palette, artKey(d.art), d.emphasis ?? '', d.shadow ? 's' : '', d.outline ? 'o' : '', colors].join('|');
}

/** Which artwork suits which layout. */
const LAYOUT_MOTIFS: Record<LayoutId, MotifId[] | null> = {
  stack: null,
  badge: ['sunset-clock', 'sunset-palm', 'sunset', 'palm-duo', 'plane-sun', 'hourglass-island', 'clock', 'bungalow-sunset', 'balloons', 'cake', 'grad-cap', 'laurel', 'hearts', 'champagne', 'confetti'],
  arch: ['hourglass-island', 'clock', 'palm-duo', 'sunset-palm', 'plane-sun', 'sunset-clock', 'grad-cap', 'laurel', 'hearts', 'balloons', 'champagne'],
  bigtype: ['sun-rays', 'sunset', 'confetti', 'none'],
  ticket: ['none'],
  stamp: ['plane-sun', 'palm-duo', 'clock', 'sunset', 'laurel', 'grad-cap', 'hearts', 'champagne'],
  minimal: ['palm-duo', 'sunset', 'clock', 'plane-sun', 'hearts', 'champagne', 'laurel', 'grad-cap', 'balloons'],
  poster: ['sunset-palm', 'bungalow-sunset', 'sunset', 'sunset-clock', 'palm-duo', 'balloons', 'cake', 'champagne', 'hearts', 'confetti'],
};

/** Artwork for a layout: the vibe's favorites first, all within what suits the occasion. */
function artFor(layout: LayoutId, v: Vibe, r: Rand, pool?: MotifId[]): ArtRef {
  const allowed = LAYOUT_MOTIFS[layout];
  const fits = (m: MotifId) => (!allowed || allowed.includes(m)) && (!pool || pool.includes(m) || m === 'none');
  const fromVibe = v.motifs.filter(fits);
  const fromLayout = (allowed ?? pool ?? v.motifs).filter(fits);
  const choices = fromVibe.length ? fromVibe : fromLayout;
  if (!choices.length) return { kind: 'none' };
  const motif = pick(choices, r);
  if (motif === 'none') return { kind: 'none' };
  return { kind: 'motif', motif, line: layout === 'minimal' ? true : undefined };
}

function decorate(d: ShirtDesign, r: Rand): ShirtDesign {
  const loud = d.layout === 'bigtype' || d.layout === 'stack' || d.layout === 'poster';
  const out: ShirtDesign = { ...d };
  if (d.palette !== 'ink' && loud) {
    const roll = r();
    if (roll < 0.22) out.shadow = true;
    else if (roll < 0.3) out.outline = true;
  }
  return out;
}

export function freshDesign(v: Vibe, r: Rand, keepArt?: ArtRef, pool?: MotifId[]): ShirtDesign {
  const layout = pick(v.layouts, r);
  const d: ShirtDesign = {
    layout,
    pairing: pick(v.pairings, r),
    palette: pick(v.palettes, r),
    art: keepArt ?? artFor(layout, v, r, pool),
  };
  if (layout === 'ticket') d.art = keepArt && keepArt.kind !== 'motif' ? keepArt : { kind: 'none' };
  return decorate(d, r);
}

export interface GenerateOptions {
  vibes: string[];
  count: number;
  exclude?: Set<string>;
  rand: Rand;
  /** What's being celebrated: limits artwork and vibes to ones that fit. */
  occasions?: Occasion[];
}

/** A fresh batch across the chosen vibes (every vibe that suits the occasion if none chosen). */
export function generateFresh(o: GenerateOptions): ShirtDesign[] {
  const pool = o.occasions ? motifsFor(o.occasions) : undefined;
  const chosen = o.vibes.map(getVibe).filter((v): v is Vibe => !!v);
  const vibes = (chosen.length ? chosen : vibesFor(o.occasions)).slice();
  const seen = new Set(o.exclude ?? []);
  const out: ShirtDesign[] = [];
  let guard = 0;
  while (out.length < o.count && guard++ < o.count * 40) {
    const v = vibes[out.length % vibes.length];
    const d = freshDesign(v, o.rand, undefined, pool);
    const k = designKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** "More like this": change one thing at a time so the family resemblance shows. */
export function generateSimilar(base: ShirtDesign, o: Omit<GenerateOptions, 'vibes'> & { vibes?: string[] }): ShirtDesign[] {
  const r = o.rand;
  const seen = new Set(o.exclude ?? []);
  seen.add(designKey(base));
  const pool = o.occasions ? motifsFor(o.occasions) : undefined;
  const all = vibesFor(o.occasions);
  const vibes = (o.vibes?.length ? o.vibes.map(getVibe).filter((v): v is Vibe => !!v) : []).concat(all);
  const home = vibes.find((v) => v.layouts.includes(base.layout)) ?? all[0];
  const tweaks: (() => ShirtDesign)[] = [
    () => ({ ...base, palette: pick(PALETTES.filter((p) => p.id !== base.palette), r).id }),
    () => ({ ...base, pairing: pick(home.pairings.concat(PAIRINGS.map((p) => p.id)).filter((p) => p !== base.pairing), r) }),
    () => {
      if (base.art.kind !== 'motif') return { ...base, layout: pick(['stack', 'badge', 'arch', 'minimal'] as LayoutId[], r) };
      return { ...base, art: artFor(base.layout, { ...home, motifs: home.motifs.concat(LAYOUT_MOTIFS[base.layout] ?? pool ?? []) }, r, pool) };
    },
    () => {
      const layouts = (['stack', 'badge', 'arch', 'bigtype', 'poster', 'minimal', 'stamp'] as LayoutId[]).filter((l) => l !== base.layout);
      const layout = pick(layouts, r);
      const art = base.art.kind === 'motif' ? artFor(layout, { ...home, motifs: [base.art.motif, ...home.motifs] }, r, pool) : base.art;
      return { ...base, layout, art };
    },
    () => ({ ...base, emphasis: base.emphasis === 'color' ? 'script' : 'color' }),
    () => ({ ...base, shadow: !base.shadow, outline: false }),
  ];
  const out: ShirtDesign[] = [];
  let guard = 0;
  let i = Math.floor(r() * tweaks.length);
  while (out.length < o.count && guard++ < o.count * 30) {
    const d = tweaks[i++ % tweaks.length]();
    const k = designKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}
