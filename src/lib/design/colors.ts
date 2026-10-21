// Colors for particular words: "coral big words", or picked by hand in the
// Colors panel. A part without one takes the color scheme's ink, so designs
// that never had any look exactly as they always did.
import { pairing as getPairing } from './pairings';
import { contrast } from './palettes';
import { segment, smartQuotes } from './text';
import type { ColorPart, Copy, Inks, PartColors, ShirtDesign } from './types';

export const COLOR_PARTS: { id: ColorPart; label: string; word: boolean }[] = [
  { id: 'headline', label: 'Big words', word: true },
  { id: 'emphasis', label: 'Quoted words', word: true },
  { id: 'tagline', label: 'Small words', word: true },
  { id: 'extra', label: 'Tiny line', word: true },
  { id: 'outline', label: 'Outline', word: false },
  { id: 'shadow', label: 'Shadow', word: false },
];
const PART_IDS = COLOR_PARTS.map((p) => p.id);

export const partLabel = (p: ColorPart) => COLOR_PARTS.find((x) => x.id === p)?.label ?? p;

export interface Swatch {
  id: string;
  name: string;
  hex: string;
}

/** Inks that print well, with names people (and Claude) can ask for. */
export const SWATCHES: Swatch[] = [
  { id: 'ink', name: 'Ink', hex: '#1B1B1B' },
  { id: 'navy', name: 'Navy', hex: '#1F2A44' },
  { id: 'deep-sea', name: 'Deep Sea', hex: '#12355B' },
  { id: 'royal', name: 'Royal', hex: '#2F5DA8' },
  { id: 'sky', name: 'Sky', hex: '#7EC4EA' },
  { id: 'aqua', name: 'Aqua', hex: '#3CC8C8' },
  { id: 'lagoon', name: 'Lagoon', hex: '#0F8B8D' },
  { id: 'mint', name: 'Mint', hex: '#7CC6B6' },
  { id: 'fern', name: 'Fern', hex: '#3E8E41' },
  { id: 'jungle', name: 'Jungle', hex: '#1E4D3A' },
  { id: 'sunshine', name: 'Sunshine', hex: '#FFD166' },
  { id: 'gold', name: 'Gold', hex: '#C8963E' },
  { id: 'tangerine', name: 'Tangerine', hex: '#F28C28' },
  { id: 'coral', name: 'Coral', hex: '#F2654E' },
  { id: 'cherry', name: 'Cherry', hex: '#D7263D' },
  { id: 'hibiscus', name: 'Hibiscus', hex: '#E0457B' },
  { id: 'blush', name: 'Blush', hex: '#F7A6A6' },
  { id: 'lilac', name: 'Lilac', hex: '#B39DDB' },
  { id: 'plum', name: 'Plum', hex: '#8E2C68' },
  { id: 'dusk', name: 'Dusk', hex: '#5A4A6B' },
  { id: 'cocoa', name: 'Cocoa', hex: '#4A2C1D' },
  { id: 'sand', name: 'Sand', hex: '#E9D8B4' },
  { id: 'cream', name: 'Cream', hex: '#F6EEDF' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
];

/** Everyday color words, and the swatch each one means. */
const ALIASES: Record<string, string> = {
  black: 'ink',
  charcoal: 'ink',
  'navy blue': 'navy',
  'dark blue': 'navy',
  blue: 'royal',
  'royal blue': 'royal',
  'light blue': 'sky',
  'baby blue': 'sky',
  'sky blue': 'sky',
  turquoise: 'aqua',
  teal: 'lagoon',
  green: 'fern',
  'light green': 'mint',
  'dark green': 'jungle',
  'forest green': 'jungle',
  forest: 'jungle',
  yellow: 'sunshine',
  golden: 'gold',
  mustard: 'gold',
  orange: 'tangerine',
  red: 'cherry',
  pink: 'hibiscus',
  'hot pink': 'hibiscus',
  magenta: 'hibiscus',
  fuchsia: 'hibiscus',
  'light pink': 'blush',
  'pale pink': 'blush',
  'baby pink': 'blush',
  peach: 'blush',
  purple: 'plum',
  maroon: 'plum',
  burgundy: 'plum',
  lavender: 'lilac',
  violet: 'lilac',
  brown: 'cocoa',
  chocolate: 'cocoa',
  beige: 'sand',
  tan: 'sand',
  ivory: 'cream',
  'off white': 'cream',
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

const swatch = (id: string) => SWATCHES.find((s) => s.id === id);

/** A swatch name, everyday color word or "#RRGGBB" as "#RRGGBB"; undefined if it's none of those. */
export function resolveColor(v: string): string | undefined {
  const s = v.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (isHex(s)) return s.toUpperCase();
  const named = SWATCHES.find((w) => w.name.toLowerCase() === s) ?? swatch(ALIASES[s] ?? '');
  return named?.hex;
}

/** "Coral" for a swatch, the hex code for anything else. */
export function colorName(hex: string): string {
  return SWATCHES.find((s) => s.hex === hex.toUpperCase())?.name ?? hex.toUpperCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Every color word the keyword reader knows, longest first so "light blue" beats "blue". */
export const COLOR_WORDS = [...SWATCHES.map((s) => s.name.toLowerCase()), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
export const colorWordPattern = () => new RegExp(`\\b(${COLOR_WORDS.map(escape).join('|')})\\b`, 'g');

/** Only real parts with real colors, or null if anything in it is off. */
export function parseColors(v: unknown): PartColors | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: PartColors = {};
  for (const [k, c] of Object.entries(v)) {
    if (!PART_IDS.includes(k as ColorPart) || !isHex(c)) return null;
    out[k as ColorPart] = c.toUpperCase();
  }
  return out;
}

/** Whatever's usable in a stored value; undefined if nothing is. */
export function safeColors(v: unknown): PartColors | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: PartColors = {};
  for (const p of PART_IDS) if (Object.hasOwn(o, p) && isHex(o[p])) out[p] = (o[p] as string).toUpperCase();
  return Object.keys(out).length ? out : undefined;
}

/** What each part of the lettering prints in. */
export interface WordInks {
  headline: string;
  /** Quoted words in the big words. */
  emphasis: string;
  tagline: string;
  /** Quoted words in the small words. */
  taglineEmphasis: string;
  extra: string;
  outline: string;
  shadow: string;
}

/** Each part's own color if it has one, otherwise the scheme's. */
export function wordInks(inks: Inks, colors?: PartColors): WordInks {
  const c = colors ?? {};
  const headline = c.headline ?? inks.text;
  return {
    headline,
    emphasis: c.emphasis ?? inks.accent,
    tagline: c.tagline ?? inks.accent,
    // The small words' quoted bits borrow the big words' color, unless quoted words have their own.
    taglineEmphasis: c.emphasis ?? headline,
    extra: c.extra ?? inks.text,
    outline: c.outline ?? inks.outline,
    shadow: c.shadow ?? inks.shadow,
  };
}

/** The “quoted” bits of the words, without their quotes. */
export function quotedWords(copy: Copy): string[] {
  return [copy.headline, copy.tagline]
    .flatMap((t) => segment(smartQuotes(t)))
    .filter((s) => s.role === 'emph')
    .map((s) => s.text.slice(1, -1).trim())
    .filter(Boolean);
}

/**
 * A marker color per part, for working out which part was tapped on a
 * preview: the design is drawn again, invisibly, with each part in its marker
 * and laid over the real one. Colors never move anything, so the two line up.
 */
export const PROBE_COLORS: Record<ColorPart, string> = {
  headline: '#000001',
  emphasis: '#000002',
  tagline: '#000003',
  extra: '#000004',
  outline: '#000005',
  shadow: '#000006',
};

/** The part drawn in this marker color, if any. */
export function partFromProbe(fill: string | null | undefined): ColorPart | null {
  const hex = fill?.toUpperCase();
  return PART_IDS.find((p) => PROBE_COLORS[p] === hex) ?? null;
}

/** The parts this design actually shows, in panel order. */
export function partsShown(d: ShirtDesign, copy: Copy): ColorPart[] {
  const emphasis = d.emphasis ?? getPairing(d.pairing).defaultEmphasis;
  // The passport stamp is one ink with no shadow or outline.
  const effects = d.layout !== 'stamp';
  const shows: Record<ColorPart, boolean> = {
    headline: true,
    emphasis: emphasis !== 'none' && quotedWords(copy).length > 0,
    tagline: !!copy.tagline.trim(),
    extra: !!copy.extra.trim(),
    outline: effects && !!d.outline,
    shadow: effects && !!d.shadow,
  };
  return PART_IDS.filter((p) => shows[p]);
}

/** Parts whose own color would be hard to read on this shirt. */
export function hardToRead(colors: PartColors | undefined, shirtHex: string, parts: ColorPart[] = PART_IDS): ColorPart[] {
  return COLOR_PARTS.filter((p) => {
    const c = colors?.[p.id];
    return parts.includes(p.id) && !!c && contrast(c, shirtHex) < (p.word ? 2 : 1.3);
  }).map((p) => p.id);
}

/** Short phrases for what changed, e.g. "big words & small words: gold". */
export function colorChanges(before: PartColors | undefined, after: PartColors | undefined): string[] {
  const groups = new Map<string, string[]>();
  for (const { id, label } of COLOR_PARTS) {
    const a = before?.[id];
    const b = after?.[id];
    if (a === b) continue;
    const to = b ? colorName(b).toLowerCase() : '';
    groups.set(to, [...(groups.get(to) ?? []), label.toLowerCase()]);
  }
  return [...groups].map(([to, parts]) => (to ? `${parts.join(' & ')}: ${to}` : `${parts.join(' & ')} back to the scheme's color`));
}

/** Every distinct ink in rendered artwork (vector parts only; a painted picture brings its own). */
export function inksIn(svg: string): string[] {
  const found = new Set<string>();
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/g)) found.add(m[1].toUpperCase());
  return [...found];
}
