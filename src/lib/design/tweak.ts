// Turns plain-English requests ("bigger words, more blue") into design changes.
// This is the offline fallback; with Claude connected, Claude does the reading
// and returns the same kind of patch.
import { colorChanges, colorWordPattern, quotedWords, resolveColor } from './colors';
import type { ColorPart, Copy, LayoutId, MotifId, PartColors, ShirtDesign } from './types';

export interface TweakResult {
  design: ShirtDesign;
  changes: string[];
}

const clampScale = (n: number) => Math.round(Math.min(1.6, Math.max(0.6, n)) * 100) / 100;

export const PALETTE_WORDS: [RegExp, string, string][] = [
  [/\b(black and white|one colou?r|single colou?r|mono(chrome)?|simple colou?rs?)\b/, 'ink', 'one-ink colors'],
  [/\b(navy|gold|classy|elegant colou?rs?)\b/, 'navygold', 'navy and gold'],
  [/\b(pastel|soft|pink|gentle)\b/, 'pastel', 'pastel colors'],
  [/\b(retro|70s|seventies|vintage colou?rs?|brown|mustard)\b/, 'retro', 'retro 70s colors'],
  [/\b(tropical|green|jungle|bright|hibiscus)\b/, 'tropical', 'tropical colors'],
  [/\b(coral|reef)\b/, 'coral', 'coral reef colors'],
  [/\b(sunset|orange|warm|red|purple)\b/, 'sunset', 'sunset colors'],
  [/\b(blue|turquoise|teal|ocean|lagoon|aqua|sea)\b/, 'lagoon', 'lagoon blues'],
];

export const PAIRING_WORDS: [RegExp, string, string][] = [
  [/\b(typewriter|mono(space)?)\b/, 'spacemono', 'typewriter lettering'],
  [/\b(elegant|classy|serif|fancy|grown.?up|sophisticated)\b/, 'playfair-montserrat', 'an elegant serif'],
  [/\b(playful|bubbly|cute|fun(ny)?|silly)\b/, 'shrikhand-fredoka', 'a bubbly, playful font'],
  [/\b(retro font|groovy)\b/, 'righteous-caveat', 'a groovy retro font'],
  [/\b(chunky|blocky)\b/, 'rubik-montserrat', 'chunky lettering'],
  [/\b(bold|loud|strong|punchy)\b/, 'anton-yellowtail', 'bold lettering'],
  [/\b(surf|beachy)\b/, 'oswald-pacifico', 'surf-shop lettering'],
  [/\b(diner|script headline)\b/, 'lobster-oswald', 'diner script'],
];

const LAYOUT_WORDS: [RegExp, LayoutId, string][] = [
  [/\b(boarding pass|ticket)\b/, 'ticket', 'boarding pass layout'],
  [/\b(stamp|passport)\b/, 'stamp', 'stamp layout'],
  [/\b(poster|frame)\b/, 'poster', 'poster layout'],
  [/\b(circle|badge|round|ring)\b/, 'badge', 'round badge layout'],
  [/\b(arch|curved|varsity|college)\b/, 'arch', 'varsity arch layout'],
  [/\b(big type|huge (text|words|letters)|all text|giant)\b/, 'bigtype', 'big type layout'],
  [/\b(minimal|subtle|understated|small|tiny|quiet|less busy|cleaner|simpler)\b/, 'minimal', 'a quieter, minimal layout'],
  [/\b(stack(ed)?|classic)\b/, 'stack', 'classic stacked layout'],
];

/** Words that name a drawing. Loose ones (marked true) only count when the drawing suits the project. */
const MOTIF_WORDS: [RegExp, MotifId, string, loose?: true][] = [
  [/\b(balloons?)\b/, 'balloons', 'balloons'],
  [/\b(cake|candles?|cupcake)\b/, 'cake', 'a birthday cake'],
  [/\b(grad(uation)? cap|mortarboard|cap and gown|diploma|tassel)\b/, 'grad-cap', 'a graduation cap'],
  [/\b(laurels?|wreath|olive branch)\b/, 'laurel', 'a laurel wreath'],
  [/\b(hearts?)\b/, 'hearts', 'two hearts'],
  [/\b(champagne|bubbly|cheers|toast|prosecco)\b/, 'champagne', 'a champagne toast'],
  [/\b(confetti)\b/, 'confetti', 'confetti'],
  [/\b(party)\b/, 'confetti', 'confetti', true],
  [/\b(two palms?|palms)\b/, 'palm-duo', 'two palm trees'],
  [/\b(couple)\b/, 'palm-duo', 'two palm trees', true],
  [/\b(palm|coconut)\b/, 'sunset-palm', 'a palm at sunset'],
  [/\b(hourglass)\b/, 'hourglass-island', 'the island hourglass'],
  [/\b(sand|beach|island)\b/, 'hourglass-island', 'the island hourglass', true],
  [/\b(alarm|clock)\b/, 'clock', 'an alarm clock'],
  [/\b(villa|bungalow|hut|overwater|water villa)\b/, 'bungalow-sunset', 'an overwater villa'],
  [/\b(plane|flight|jet|flying|airplane)\b/, 'plane-sun', 'a jet to the sun'],
  [/\b(rays|sunburst|sunshine)\b/, 'sun-rays', 'a sunburst'],
  [/\b(sun|sunset)\b/, 'sunset', 'a retro sunset'],
];

/** Words that name one part of the lettering. */
const PART_WORDS: [RegExp, ColorPart][] = [
  [/\b((quoted|highlighted|emphasi[sz]ed|accent) (words?|bits?|part)|quotes?|emphasis)\b/, 'emphasis'],
  [/\b((small|smaller|little|bottom|second) (words?|text|letters|line)|tagline|subtitle)\b/, 'tagline'],
  [/\b((tiny|smallest) (words?|text|letters|line)|(date|year) line)\b/, 'extra'],
  [/\b((big|main|top|large|first) (words?|text|letters|line)|headline|title)\b/, 'headline'],
  [/\b((drop )?shadow)\b/, 'shadow'],
  [/\boutline\b/, 'outline'],
];
const WORD_PARTS: ColorPart[] = ['headline', 'emphasis', 'tagline', 'extra'];
const ALL_WORDS = /\b(words?|text|letters|lettering|writing|font)\b/;
const THE_REST = /\b(the rest|everything else|other words|the others)\b/;

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ');

/**
 * "Make the Un coral and the small words navy": a color for each part named,
 * and what's left of the request for everything else to read. A color with
 * no part named is left alone, so "more blue" still means the blue scheme.
 */
export function partColorRequests(request: string, copy?: Copy): { colors: PartColors; rest: string } {
  let rest = ` ${plain(request)} `;
  const colors: PartColors = {};
  const quoted = (copy ? quotedWords(copy) : []).map(plain).map((w) => w.trim()).filter((w) => w.length > 1);
  // "the big words and the small words gold": parts named before the color wait for it.
  let waiting: ColorPart[] = [];
  for (const clause of request.toLowerCase().split(/[,;.!?\n]|\b(?:and|but|then|plus|also|while)\b/)) {
    const text = ` ${plain(clause)} `;
    const named = [...new Set([...text.matchAll(colorWordPattern())].map((m) => resolveColor(m[1])))];
    const hex = clause.match(/#[0-9a-f]{6}\b/)?.[0];
    const found = hex ? [hex.toUpperCase()] : named.filter((c): c is string => !!c);
    let parts: ColorPart[] = PART_WORDS.filter(([re]) => re.test(text)).map(([, p]) => p);
    if (quoted.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))) parts.unshift('emphasis');
    if (found.length !== 1) {
      // No color (or too many to tell apart): any part named waits for the next one.
      if (!found.length) waiting = [...waiting, ...parts];
      continue;
    }
    parts = [...waiting, ...parts];
    waiting = [];
    if (!parts.length && THE_REST.test(text)) parts = WORD_PARTS.filter((p) => !(p in colors));
    if (!parts.length && ALL_WORDS.test(text)) parts = ['headline', 'tagline', 'extra'];
    if (!parts.length) continue;
    for (const p of parts) colors[p] = found[0];
    rest = rest.replace(text.trim(), ' ');
  }
  return { colors, rest };
}

/**
 * `suits`: the drawings that fit the project, so loose words don't drag in the wrong one.
 * `copy`: the words on this design, so "the Un" can mean the quoted word.
 */
export function heuristicTweak(base: ShirtDesign, request: string, suits?: MotifId[], copy?: Copy): TweakResult {
  const painted = partColorRequests(request, copy);
  const q = painted.rest;
  const d: ShirtDesign = { ...base };
  const changes: string[] = [];

  // Colors for particular words
  if (Object.keys(painted.colors).length) {
    d.colors = { ...base.colors, ...painted.colors };
    changes.push(...colorChanges(base.colors, d.colors));
    // A colored outline or shadow needs to be there to be seen.
    if (painted.colors.outline && !d.outline) {
      d.outline = true;
      d.shadow = false;
      changes.push('an outline');
    }
    if (painted.colors.shadow && !d.shadow) {
      d.shadow = true;
      d.outline = false;
      changes.push('a drop shadow');
    }
  }
  const bigger = /\b(bigger|larger|huge|more prominent|bolder)\b/;
  const smaller = /\b(smaller|tinier|less prominent|shrink)\b/;
  const mentions = (re: RegExp) => re.test(q);

  // Size changes
  const sizeOf = (target: RegExp, key: 'headlineScale' | 'taglineScale' | 'artScale', label: string) => {
    const re = new RegExp(`(${bigger.source}|${smaller.source})[a-z ]{0,20}${target.source}|${target.source}[a-z ]{0,20}(${bigger.source}|${smaller.source})`);
    const m = q.match(re);
    if (!m) return false;
    const up = bigger.test(m[0]);
    d[key] = clampScale((d[key] ?? 1) * (up ? 1.15 : 0.87));
    changes.push(`${up ? 'bigger' : 'smaller'} ${label}`);
    return true;
  };
  sizeOf(/\b(tagline|small words|bottom (words|line))\b/, 'taglineScale', 'tagline');
  sizeOf(/\b(art|artwork|picture|image|drawing|sun|palm|graphic|illustration)\b/, 'artScale', 'artwork');
  if (!changes.some((c) => c.includes('tagline'))) sizeOf(/\b(words|text|headline|letters|names|title)\b/, 'headlineScale', 'words');

  // No art
  if (mentions(/\b(no (art|picture|image|graphic|drawing)|just (the )?words|text only|only words|remove the (art|picture))\b/)) {
    d.art = { kind: 'none' };
    if (d.layout === 'poster' || d.layout === 'badge') d.layout = 'bigtype';
    changes.push('removed the artwork');
  } else {
    for (const [re, motif, label, loose] of MOTIF_WORDS) {
      if (loose && suits && !suits.includes(motif)) continue;
      if (mentions(re) && !/\b(bigger|smaller)\b/.test(q.slice(Math.max(0, q.search(re) - 12), q.search(re)))) {
        if (d.art.kind !== 'motif' || d.art.motif !== motif) {
          d.art = { kind: 'motif', motif, line: d.layout === 'minimal' ? true : undefined };
          changes.push(`artwork: ${label}`);
        }
        break;
      }
    }
  }

  for (const [re, layout, label] of LAYOUT_WORDS) {
    if (mentions(re)) {
      if (d.layout !== layout) {
        d.layout = layout;
        if (layout === 'minimal' && d.art.kind === 'motif') d.art = { ...d.art, line: true };
        if (layout !== 'minimal' && d.art.kind === 'motif' && d.art.line) d.art = { ...d.art, line: undefined };
        if (layout === 'ticket') d.art = { kind: 'none' };
        changes.push(label);
      }
      break;
    }
  }

  for (const [re, palette, label] of PALETTE_WORDS) {
    if (mentions(re)) {
      if (d.palette !== palette) {
        d.palette = palette;
        changes.push(label);
      }
      break;
    }
  }
  if (!changes.some((c) => c.includes('colors') || c.includes('blues') || c.includes('navy')) && mentions(/\b(different|other|new) colou?rs?\b/)) {
    const order = ['lagoon', 'sunset', 'retro', 'tropical', 'navygold', 'coral', 'pastel', 'ink'];
    d.palette = order[(order.indexOf(d.palette) + 1) % order.length];
    changes.push('different colors');
  }

  for (const [re, pairing, label] of PAIRING_WORDS) {
    if (mentions(re)) {
      if (d.pairing !== pairing) {
        d.pairing = pairing;
        changes.push(label);
      }
      break;
    }
  }
  if (!changes.some((c) => c.includes('font') || c.includes('lettering') || c.includes('serif') || c.includes('script')) && mentions(/\b(different|other|new) (font|lettering|type)\b/)) {
    const order = ['bebas-pacifico', 'anton-yellowtail', 'abril-josefin', 'alfa-lobster', 'playfair-montserrat', 'oswald-pacifico', 'dmserif-caveat', 'righteous-caveat'];
    d.pairing = order[(order.indexOf(d.pairing) + 1) % order.length];
    changes.push('a different font');
  }

  if (mentions(/\b(no shadow|without (the )?shadow|remove (the )?shadow)\b/)) {
    d.shadow = false;
    changes.push('no shadow');
  } else if (mentions(/\bshadow\b/)) {
    d.shadow = true;
    d.outline = false;
    changes.push('a drop shadow');
  }
  if (mentions(/\b(no outline|remove (the )?outline)\b/)) {
    d.outline = false;
    changes.push('no outline');
  } else if (mentions(/\boutline\b/)) {
    d.outline = true;
    d.shadow = false;
    changes.push('an outline');
  }
  if (mentions(/\b(script|cursive|handwritten|fancy un|swirly)\b/)) {
    d.emphasis = 'script';
    changes.push('script for the quoted words');
  }
  if (mentions(/\b(less cheesy|tone it down|calmer|more grown.?up)\b/) && !changes.length) {
    d.layout = 'minimal';
    d.pairing = 'playfair-montserrat';
    d.shadow = false;
    d.outline = false;
    if (d.art.kind === 'motif') d.art = { ...d.art, line: true };
    changes.push('a calmer, more grown-up look');
  }

  return { design: d, changes };
}
