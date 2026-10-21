// Est. 2002 / Vintage 1986 / Class of 2027: a small mark, usually under the collar.
import { arcText, bottom, capH, draw, peopleLine, rect, ring, rule, star, text, union, type BackKit, type Composed } from '../kit';
import type { BackTemplate } from './types';

/** The part of the signature after the last "·" ("Lisbon 2027"), else the dates. */
export function tagOf(k: BackKit): string {
  const parts = k.facts.signature.split('·').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : k.facts.dates;
}

const yearLine = (k: BackKit) => [k.facts.yearLabel, k.facts.year].filter((s) => s.trim()).join(' ');

/** A round stamp: names over the top, a tag under, the year in the middle. */
function stamp(k: BackKit): Composed {
  const cx = 750;
  const cy = 750;
  const R = 600;
  let svg = ring(cx, cy, R, k.inks.text, 26) + ring(cx, cy, R - 46, k.inks.text, 8);
  const textR = R - 205;
  const top = arcText(k, peopleLine(k.facts.people), { role: 'headline', cx, cy, r: textR, side: 'top', span: 150, size: 140, upper: true });
  const bot = arcText(k, tagOf(k), { role: 'label', cx, cy, r: textR, side: 'bottom', span: 120, size: 92, fill: k.inks.accent });
  const band = Math.max(top.size * capH(k, 'headline'), 80);
  svg += draw(top) + draw(bot) + ring(cx, cy, textR - 40, k.inks.text, 8);
  for (const s of [-1, 1]) svg += star(cx + s * (textR + band / 2), cy, band * 0.32, k.inks.accent);
  const L = text(k, k.facts.yearLabel, { role: 'script', box: { x: cx - 260, y: cy - 220, w: 520, h: 140 }, size: 130, fill: k.inks.accent });
  const Y = text(k, k.facts.year, { role: 'headline', box: { x: cx - 290, y: (L.size ? bottom(L.bbox) : cy - 200) + 20, w: 580, h: 300 }, size: 300 });
  svg += draw(L) + draw(Y);
  return { svg, bbox: { x: cx - R - 14, y: cy - R - 14, w: 2 * R + 28, h: 2 * R + 28 } };
}

/** A woven-label rectangle. */
function label(k: BackKit): Composed {
  let svg = '';
  const P = text(k, peopleLine(k.facts.people), { role: 'headline', box: { x: 160, y: 120, w: 1180, h: 300 }, size: 260, lines: 2, prefer: 1, upper: true });
  let y = bottom(P.bbox) + 70;
  const Yl = text(k, yearLine(k), { role: 'label', box: { x: 450, y, w: 600, h: 90 }, size: 84, fill: k.inks.accent });
  const mid = Yl.bbox.y + Yl.bbox.h / 2;
  svg += draw(P) + draw(Yl);
  svg += rule(170, mid, Yl.bbox.x - 40, mid, k.inks.text, 7) + rule(Yl.bbox.x + Yl.bbox.w + 40, mid, 1330, mid, k.inks.text, 7);
  y = bottom(Yl.bbox) + 60;
  const T = text(k, tagOf(k), { role: 'label', box: { x: 250, y, w: 1000, h: 70 }, size: 64 });
  svg += draw(T);
  const content = union(P.bbox, Yl.bbox, T.bbox, { x: 170, y: mid, w: 1160, h: 1 });
  const frame = { x: content.x - 80, y: content.y - 80, w: content.w + 160, h: content.h + 160 };
  svg = rect(frame, { stroke: k.inks.text, width: 18, rx: 24 }) + rect({ x: frame.x + 30, y: frame.y + 30, w: frame.w - 60, h: frame.h - 60 }, { stroke: k.inks.text, width: 6, rx: 12 }) + svg;
  return { svg, bbox: { x: frame.x - 9, y: frame.y - 9, w: frame.w + 18, h: frame.h + 18 } };
}

/** Varsity: names arched, the year big underneath. */
function collegiate(k: BackKit): Composed {
  const A = arcText(k, peopleLine(k.facts.people), { role: 'headline', cx: 750, cy: 1500, r: 1250, side: 'top', span: 58, size: 220, upper: true });
  const L = text(k, k.facts.yearLabel, { role: 'script', box: { x: 350, y: bottom(A.bbox) + 40, w: 800, h: 170 }, size: 160, fill: k.inks.accent });
  const Y = text(k, k.facts.year, { role: 'headline', box: { x: 150, y: (L.size ? bottom(L.bbox) : bottom(A.bbox)) + 30, w: 1200, h: 620 }, size: 620 });
  const fx = { shadow: { dx: Y.size * 0.03, dy: Y.size * 0.03, color: k.inks.shadow } };
  const grow = Y.size * 0.03;
  return { svg: draw(A) + draw(L) + draw(Y, fx), bbox: union(A.bbox, L.bbox, { ...Y.bbox, w: Y.bbox.w + grow, h: Y.bbox.h + grow }) };
}

export const established: BackTemplate = {
  id: 'established',
  name: 'Est. / Class of',
  blurb: 'A small mark with the year that started it',
  occasions: ['anniversary', 'birthday', 'graduation', 'reunion', 'team', 'everyday'],
  uses: ['people', 'year', 'yearLabel', 'signature'],
  variants: [
    { id: 'stamp', name: 'Round stamp' },
    { id: 'label', name: 'Label' },
    { id: 'collegiate', name: 'Varsity' },
  ],
  sizes: ['neck', 'full'],
  build: (k) => (k.back.variant === 'label' ? label(k) : k.back.variant === 'collegiate' ? collegiate(k) : stamp(k)),
};
