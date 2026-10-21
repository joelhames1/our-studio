import type { Occasion } from './back/types';
import { motifsFor } from './occasions';
import type { LayoutId, MotifId, ShirtDesign } from './types';

export interface Vibe {
  id: string;
  name: string;
  blurb: string;
  layouts: LayoutId[];
  pairings: string[];
  palettes: string[];
  motifs: MotifId[];
  /** Style direction for AI artwork in this vibe. */
  artStyle: string;
  /** What the vibe card shows. */
  sample: ShirtDesign;
  /** Only offered for these occasions; missing means it suits anything. */
  occasions?: Occasion[];
}

export const VIBES: Vibe[] = [
  {
    id: 'retro-poster',
    occasions: ['trip'],
    name: 'Retro Travel Poster',
    blurb: 'Sunsets, palms, 1970s colors',
    layouts: ['poster', 'stack', 'badge'],
    pairings: ['bebas-pacifico', 'alfa-lobster', 'oswald-pacifico'],
    palettes: ['retro', 'sunset', 'lagoon'],
    motifs: ['sunset-palm', 'bungalow-sunset', 'sunset'],
    artStyle: '1970s retro travel poster illustration, flat screen-print style, bold simple shapes, limited palette of 4 flat colors, no gradients',
    sample: { layout: 'poster', pairing: 'alfa-lobster', palette: 'retro', art: { kind: 'motif', motif: 'sunset-palm' } },
  },
  {
    id: 'minimal',
    name: 'Minimal Line Art',
    blurb: 'Quiet, elegant, one fine line',
    layouts: ['minimal', 'stack'],
    pairings: ['playfair-montserrat', 'abril-josefin', 'dmserif-caveat'],
    palettes: ['ink', 'navygold', 'lagoon'],
    motifs: ['palm-duo', 'sunset', 'clock', 'plane-sun', 'hearts', 'champagne', 'laurel', 'grad-cap', 'balloons'],
    artStyle: 'minimalist single continuous line drawing, monoline ink, elegant, lots of negative space',
    sample: { layout: 'minimal', pairing: 'playfair-montserrat', palette: 'navygold', art: { kind: 'motif', motif: 'palm-duo', line: true } },
  },
  {
    id: 'watercolor',
    occasions: ['trip'],
    name: 'Tropical Watercolor',
    blurb: 'Soft, painterly, beachy',
    layouts: ['stack', 'badge', 'minimal'],
    pairings: ['dmserif-caveat', 'lobster-oswald', 'playfair-montserrat'],
    palettes: ['pastel', 'lagoon', 'coral'],
    motifs: ['palm-duo', 'sunset-palm', 'bungalow-sunset'],
    artStyle: 'loose tropical watercolor illustration, soft washes but crisp edges, isolated subject, no paper texture',
    sample: { layout: 'stack', pairing: 'dmserif-caveat', palette: 'pastel', art: { kind: 'motif', motif: 'palm-duo' } },
  },
  {
    id: 'stamp',
    name: 'Vintage Stamp',
    blurb: 'Stamps, badges and seals',
    layouts: ['stamp', 'badge'],
    pairings: ['alfa-lobster', 'rubik-montserrat', 'oswald-pacifico'],
    palettes: ['navygold', 'ink', 'retro'],
    motifs: ['plane-sun', 'palm-duo', 'clock', 'sunset', 'laurel', 'grad-cap', 'hearts', 'champagne'],
    artStyle: 'vintage engraved postage stamp illustration, fine hatching, one or two ink colors',
    sample: { layout: 'badge', pairing: 'oswald-pacifico', palette: 'navygold', art: { kind: 'motif', motif: 'plane-sun' } },
  },
  {
    id: 'streetwear',
    name: 'Bold Streetwear',
    blurb: 'Huge type, loud colors',
    layouts: ['bigtype', 'arch'],
    pairings: ['anton-yellowtail', 'rubik-montserrat', 'bebas-pacifico'],
    palettes: ['sunset', 'tropical', 'ink'],
    motifs: ['sun-rays', 'sunset', 'confetti', 'none'],
    artStyle: 'bold graphic streetwear illustration, thick confident outlines, high contrast, flat color',
    sample: { layout: 'bigtype', pairing: 'anton-yellowtail', palette: 'tropical', art: { kind: 'motif', motif: 'sun-rays' }, shadow: true },
  },
  {
    id: 'cartoon',
    name: 'Playful Cartoon',
    blurb: 'Cheeky, cute, a little silly',
    layouts: ['stack', 'badge', 'arch'],
    pairings: ['shrikhand-fredoka', 'righteous-caveat'],
    palettes: ['tropical', 'coral', 'pastel'],
    motifs: ['hourglass-island', 'clock', 'sunset-clock', 'balloons', 'cake', 'hearts', 'confetti', 'grad-cap'],
    artStyle: 'cute playful cartoon illustration, thick clean outlines, bright cheerful colors, sticker style',
    sample: { layout: 'stack', pairing: 'shrikhand-fredoka', palette: 'coral', art: { kind: 'motif', motif: 'hourglass-island' } },
  },
  {
    id: 'boarding',
    occasions: ['trip'],
    name: 'Boarding Pass',
    blurb: 'Your trip as a ticket: from, to, date',
    layouts: ['ticket'],
    pairings: ['spacemono', 'rubik-montserrat', 'oswald-pacifico'],
    palettes: ['ink', 'navygold', 'lagoon'],
    motifs: ['none'],
    artStyle: 'clean vector travel icon',
    sample: { layout: 'ticket', pairing: 'spacemono', palette: 'lagoon', art: { kind: 'none' } },
  },
  {
    id: 'sunset',
    occasions: ['trip'],
    name: 'Clean Sunset',
    blurb: 'Striped sun, crisp and simple',
    layouts: ['badge', 'stack', 'arch'],
    pairings: ['bebas-pacifico', 'abril-josefin', 'oswald-pacifico'],
    palettes: ['sunset', 'lagoon', 'coral'],
    motifs: ['sunset-clock', 'sunset', 'sunset-palm'],
    artStyle: 'minimal geometric vector sunset illustration, clean flat shapes, retro stripes',
    sample: { layout: 'badge', pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sunset-clock' } },
  },
  {
    id: 'party',
    occasions: ['birthday', 'reunion', 'everyday'],
    name: 'Party Pop',
    blurb: 'Balloons, confetti, bright and bubbly',
    layouts: ['stack', 'badge', 'poster', 'bigtype'],
    pairings: ['shrikhand-fredoka', 'righteous-caveat', 'lobster-oswald'],
    palettes: ['coral', 'tropical', 'pastel'],
    motifs: ['balloons', 'confetti', 'cake'],
    artStyle: 'bright playful party illustration, flat bold shapes, confetti accents, 4 flat colors',
    sample: { layout: 'stack', pairing: 'shrikhand-fredoka', palette: 'coral', art: { kind: 'motif', motif: 'balloons' } },
  },
  {
    id: 'varsity',
    occasions: ['graduation', 'team', 'reunion'],
    name: 'Varsity',
    blurb: 'Collegiate arches, laurels, gold',
    layouts: ['arch', 'badge', 'stamp'],
    pairings: ['alfa-lobster', 'anton-yellowtail', 'oswald-pacifico'],
    palettes: ['navygold', 'retro', 'ink'],
    motifs: ['laurel', 'grad-cap'],
    artStyle: 'vintage collegiate emblem illustration, bold flat shapes, two or three colors',
    sample: { layout: 'arch', pairing: 'alfa-lobster', palette: 'navygold', art: { kind: 'motif', motif: 'laurel' } },
  },
  {
    id: 'sweet',
    occasions: ['anniversary', 'everyday'],
    name: 'Sweet & Simple',
    blurb: 'Hearts, a toast, soft colors',
    layouts: ['stack', 'minimal', 'badge'],
    pairings: ['playfair-montserrat', 'dmserif-caveat', 'abril-josefin'],
    palettes: ['sunset', 'pastel', 'navygold'],
    motifs: ['hearts', 'champagne'],
    artStyle: 'charming minimal illustration, soft rounded shapes, flat colors, romantic but not cheesy',
    sample: { layout: 'stack', pairing: 'dmserif-caveat', palette: 'pastel', art: { kind: 'motif', motif: 'hearts' } },
  },
];

/** Vibes that suit these occasions (all of them when there's no occasion). */
export function vibesFor(occasions?: Occasion[]): Vibe[] {
  if (!occasions?.length) return VIBES.filter((v) => !v.occasions || v.occasions.includes('trip'));
  return VIBES.filter((v) => !v.occasions || v.occasions.some((o) => occasions.includes(o)));
}

/**
 * The vibe's preview card for this project: its own sample, with artwork
 * swapped for one that suits the occasion (no palm trees on a graduation).
 */
export function sampleFor(v: Vibe, occasions: Occasion[]): ShirtDesign {
  const art = v.sample.art;
  if (art.kind !== 'motif') return v.sample;
  const pool = motifsFor(occasions);
  if (pool.includes(art.motif)) return v.sample;
  const motif = v.motifs.find((m) => m !== 'none' && pool.includes(m)) ?? pool.find((m) => m !== 'none') ?? 'sun-rays';
  return { ...v.sample, art: { ...art, motif } };
}

export function vibe(id: string): Vibe | undefined {
  return VIBES.find((v) => v.id === id);
}
