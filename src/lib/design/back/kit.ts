// Drawing helpers shared by the back templates: text in the pairing's roles
// (recorded for the spelling check), rules, dots, planes, stars.
import { contrast } from '../palettes';
import { capHeightEm, inkToSvg, layoutArc, layoutBlock, layoutLines, runsFor, shape, smartQuotes, type Effects, type Ink, type TextStyle } from '../text';
import type { Box, Emphasis, FontSet, Inks, Pairing, PartColors, RenderContext, TextRole } from '../types';
import type { BackDesign, Facts } from './types';

export interface BackContext extends RenderContext {
  facts: Facts;
  /** Whose shirt this is, for templates that print a name per person. */
  wearer?: string;
}

export interface BackKit {
  back: BackDesign;
  ctx: BackContext;
  facts: Facts;
  fonts: FontSet;
  inks: Inks;
  /** Word colors picked on the front, already folded into `inks`; quoted and tiny words use them directly. */
  picked?: PartColors;
  pairing: Pairing;
  emphasis: Emphasis;
  wearer: string;
  /** Every printed string, in drawing order, exactly as it prints. */
  words: string[];
}

export interface Composed {
  svg: string;
  bbox: Box;
}

export const f = (n: number) => Math.round(n * 10) / 10;

export function union(...boxes: (Box | null | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(...list.map((b) => b.x));
  const y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w));
  const y2 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const bottom = (b: Box) => b.y + b.h;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// --- text -----------------------------------------------------------------------

/**
 * headline: the pairing's big face; script: its tagline face; label: small
 * tracked caps; list: label face with tighter tracking for long rows;
 * mono / monoBold: typewriter, for receipts and departure boards.
 */
export type Role = 'headline' | 'script' | 'label' | 'list' | 'mono' | 'monoBold';

export function roleOf(k: BackKit, role: Role): TextRole {
  const p = k.pairing;
  switch (role) {
    case 'headline':
      return p.headline;
    case 'script':
      return p.tagline;
    case 'label':
      return p.extra;
    case 'list':
      return { ...p.extra, tracking: Math.min(p.extra.tracking ?? 0, 0.1), lineHeight: 1.15 };
    case 'mono':
      return { font: 'spacemono', upper: true, tracking: 0, lineHeight: 1.25 };
    case 'monoBold':
      return { font: 'spacemono-bold', upper: true, tracking: 0, lineHeight: 1.2 };
  }
}

export interface TextOpts {
  role?: Role;
  box: Box;
  /** Largest size allowed; text shrinks to fit the box. */
  size: number;
  lines?: number;
  prefer?: number;
  align?: 'center' | 'left' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  fill?: string;
  accent?: string;
  upper?: boolean;
  tracking?: number;
  /** Lay out at exactly this size (no shrinking). */
  exact?: boolean;
  /** Leave out of the spelling list (decorative repeats). */
  quiet?: boolean;
}

function styleFor(k: BackKit, o: { role?: Role; fill?: string; accent?: string; upper?: boolean; tracking?: number }): TextStyle {
  const r = o.role ?? 'headline';
  let role = roleOf(k, r);
  if (o.upper !== undefined) role = { ...role, upper: o.upper };
  if (o.tracking !== undefined) role = { ...role, tracking: o.tracking };
  const fill = o.fill ?? (r === 'label' || r === 'list' ? k.picked?.extra : undefined);
  return { role, pairing: k.pairing, inks: k.inks, emphasis: k.emphasis, fill, accentFill: o.accent ?? k.picked?.emphasis };
}

/** Text exactly as it prints: curly quotes, capitals and all. */
export function printed(k: BackKit, t: string, o: { role?: Role; upper?: boolean } = {}): string {
  const s = styleFor(k, o);
  return smartQuotes(t.trim())
    .split(/\n+/)
    .map((line) => runsFor(line.trim(), s).map((r) => r.text).join(''))
    .join(' ');
}

export function record(k: BackKit, t: string, o: { role?: Role; upper?: boolean } = {}) {
  const p = printed(k, t, o);
  if (p.trim()) k.words.push(p);
}

export function text(k: BackKit, t: string, o: TextOpts): Ink {
  const empty: Ink = { pieces: [], bbox: { x: o.box.x, y: o.box.y, w: 0, h: 0 }, size: 0 };
  if (!t.trim()) return empty;
  if (!o.quiet) record(k, t, o);
  const style = styleFor(k, o);
  if (o.exact) {
    return layoutLines([smartQuotes(t.trim())], o.size, { text: t, style, fonts: k.fonts, box: o.box, align: o.align, valign: o.valign });
  }
  return layoutBlock({
    text: t,
    style,
    fonts: k.fonts,
    box: o.box,
    maxLines: o.lines ?? 1,
    maxSize: o.size,
    align: o.align ?? 'center',
    valign: o.valign ?? 'top',
    preferLines: o.prefer,
  });
}

/** Width of one line of text at size 1. */
export function measure(k: BackKit, t: string, o: { role?: Role; upper?: boolean; tracking?: number } = {}): number {
  const style = styleFor(k, o);
  return shape(runsFor(smartQuotes(t.trim()), style), k.fonts, 1).width;
}

export function arcText(
  k: BackKit,
  t: string,
  o: { role?: Role; cx: number; cy: number; r: number; side: 'top' | 'bottom'; span: number; size: number; fill?: string; upper?: boolean; quiet?: boolean },
): Ink {
  if (!t.trim()) return { pieces: [], bbox: { x: o.cx, y: o.cy, w: 0, h: 0 }, size: 0 };
  if (!o.quiet) record(k, t, o);
  return layoutArc({ text: t, style: styleFor(k, o), fonts: k.fonts, cx: o.cx, cy: o.cy, r: o.r, side: o.side, maxSpanDeg: o.span, maxSize: o.size });
}

export const draw = (ink: Ink, fx?: Effects) => inkToSvg(ink, fx);

/** Cap height of a role's font, in em. */
export const capH = (k: BackKit, role: Role) => capHeightEm(k.fonts, roleOf(k, role).font);

/** "Joel & Erin", "Ana, Ben & Cy", or one name. */
export function peopleLine(people: string[]): string {
  const p = people.filter((n) => n.trim());
  if (p.length <= 1) return p[0] ?? '';
  if (p.length === 2) return `${p[0]} & ${p[1]}`;
  return `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}`;
}

// --- shapes -----------------------------------------------------------------------

export function rule(x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash?: string): string {
  return `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" stroke="${color}" stroke-width="${f(width)}" fill="none" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function dot(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
}

export function ring(cx: number, cy: number, r: number, color: string, width: number): string {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${f(width)}"/>`;
}

export function rect(b: Box, o: { fill?: string; stroke?: string; width?: number; rx?: number }): string {
  return `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"${o.rx ? ` rx="${f(o.rx)}"` : ''} fill="${o.fill ?? 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${f(o.width ?? 4)}"` : ''}/>`;
}

const PLANE = 'M0 -100L9 -86L12 -30L95 12L95 28L12 6L9 62L36 84L36 96L0 86L-36 96L-36 84L-9 62L-12 6L-95 28L-95 12L-12 -30L-9 -86Z';

/** A plane seen from above. `deg` is the heading: 0 points up, 90 right, 180 down. */
export function plane(cx: number, cy: number, size: number, deg: number, fill: string): string {
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(deg)}) scale(${Math.round((size / 196) * 10000) / 10000})"><path d="${PLANE}" fill="${fill}"/></g>`;
}

/** A five-pointed star, used as a separator. */
export function star(cx: number, cy: number, r: number, fill: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `<path d="M${pts.join('L')}Z" fill="${fill}"/>`;
}

/** A rule with a star in the middle: ───── ★ ───── */
export function starRule(cx: number, y: number, half: number, k: BackKit, width = 6): string {
  const r = width * 3.2;
  return rule(cx - half, y, cx - r * 2, y, k.inks.art, width) + star(cx, y, r, k.inks.accent) + rule(cx + r * 2, y, cx + half, y, k.inks.art, width);
}

/** The first color from `options` that reads against `bg`. */
export function readable(bg: string, options: string[], min = 3): string {
  return options.find((c) => contrast(c, bg) >= min) ?? (contrast('#111111', bg) > contrast('#F7F3EA', bg) ? '#111111' : '#F7F3EA');
}
