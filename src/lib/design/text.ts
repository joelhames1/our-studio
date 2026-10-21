// Typography engine. Turns words into SVG outlines (paths), so what Erin sees in
// the browser is exactly what the printer gets: no font substitution, no
// "the shop didn't have Pacifico installed", and no AI-garbled spelling.
import type { Font, Glyph, Path, PathCommand } from 'opentype.js';
import type { Box, Emphasis, FontSet, Inks, Pairing, TextRole } from './types';

// ---------------------------------------------------------------------------
// Text preparation
// ---------------------------------------------------------------------------

/** Straight quotes to typographer's quotes: "Un" -> “Un”, Erin's -> Erin’s. */
export function smartQuotes(input: string): string {
  const chars = Array.from(input);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const prev = i > 0 ? chars[i - 1] : '';
    const next = i + 1 < chars.length ? chars[i + 1] : '';
    const opening = prev === '' || /[\s([{—–-]/.test(prev);
    if (c === '"') out += opening ? '“' : '”';
    else if (c === "'") {
      // '95 is an apostrophe, not an opening quote.
      out += opening && !/\d/.test(next) ? '‘' : '’';
    } else out += c;
  }
  return out;
}

export type SegmentRole = 'normal' | 'emph' | 'ord';
export interface Segment {
  text: string;
  role: SegmentRole;
}

/** Splits text into plain, “quoted” (emphasized) and ordinal-suffix (31st) parts. */
export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /“[^”]*”|\d+(?:st|nd|rd|th)(?![A-Za-z])/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string, role: SegmentRole) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.text += t;
    else out.push({ text: t, role });
  };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index), 'normal');
    const hit = m[0];
    if (hit.startsWith('“')) push(hit, 'emph');
    else {
      const digits = hit.match(/^\d+/)![0];
      push(digits, 'normal');
      push(hit.slice(digits.length), 'ord');
    }
    last = m.index + hit.length;
  }
  push(text.slice(last), 'normal');
  return out;
}

// ---------------------------------------------------------------------------
// Runs and shaping
// ---------------------------------------------------------------------------

export interface RunStyle {
  font: string;
  /** Size relative to the line's base size. */
  scale: number;
  /** Baseline shift upward, in em of the base size. */
  rise: number;
  fill: string;
  /** Letter spacing, em. */
  tracking: number;
}

export interface Run {
  text: string;
  style: RunStyle;
}

export interface TextStyle {
  role: TextRole;
  pairing: Pairing;
  inks: Inks;
  emphasis: Emphasis;
  fill?: string;
  accentFill?: string;
}

/** Applies case, emphasis and ordinal styling to one line of text. */
export function runsFor(line: string, s: TextStyle): Run[] {
  const fill = s.fill ?? s.inks.text;
  const accent = s.accentFill ?? s.inks.accent;
  const tracking = s.role.tracking ?? 0;
  const base: RunStyle = { font: s.role.font, scale: 1, rise: 0, fill, tracking };
  return segment(line).map(({ text, role }): Run => {
    if (role === 'emph' && s.emphasis !== 'none') {
      if (s.emphasis === 'script') {
        // Script faces look wrong in all caps, so keep the typed case.
        return { text, style: { ...base, font: s.pairing.emphasisFont, fill: accent, tracking: 0, scale: s.role.upper ? 1.05 : 1 } };
      }
      return { text: s.role.upper ? text.toUpperCase() : text, style: { ...base, fill: accent } };
    }
    if (role === 'ord' && s.role.upper) {
      return { text: text.toUpperCase(), style: { ...base, scale: 0.5, rise: 0.36, tracking: tracking + 0.02 } };
    }
    return { text: s.role.upper ? text.toUpperCase() : text, style: base };
  });
}

interface Placed {
  font: Font;
  glyph: Glyph;
  x: number;
  rise: number;
  size: number;
  fill: string;
  advance: number;
}

const SUBSTITUTES: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '·': '.',
  '•': '.',
};

/** Glyphs that read badly in a given face and borrow from another font. */
export const GLYPH_OVERRIDES: Record<string, Record<string, string>> = {
  righteous: { '&': 'montserrat-bold' },
};

function pickFont(fonts: FontSet, id: string): Font {
  return fonts[id] ?? fonts['montserrat'] ?? Object.values(fonts)[0];
}

function glyphFor(ch: string, font: Font, fonts: FontSet): { font: Font; glyph: Glyph } {
  let g = font.charToGlyph(ch);
  if (g && g.index !== 0) return { font, glyph: g };
  if (/\s/.test(ch)) return { font, glyph: font.charToGlyph(' ') };
  const sub = SUBSTITUTES[ch];
  if (sub) {
    g = font.charToGlyph(sub);
    if (g && g.index !== 0) return { font, glyph: g };
  }
  const fallback = fonts['montserrat'];
  if (fallback && fallback !== font) {
    g = fallback.charToGlyph(ch);
    if (g && g.index !== 0) return { font: fallback, glyph: g };
  }
  return { font, glyph: font.charToGlyph(ch) };
}

export function shape(runs: Run[], fonts: FontSet, size: number): { glyphs: Placed[]; width: number } {
  const glyphs: Placed[] = [];
  let x = 0;
  let lastTracking = 0;
  for (const run of runs) {
    const runFont = pickFont(fonts, run.style.font);
    const s = size * run.style.scale;
    let prev: { font: Font; glyph: Glyph } | null = null;
    for (const ch of Array.from(run.text)) {
      const overrideId = GLYPH_OVERRIDES[run.style.font]?.[ch];
      const { font, glyph } = glyphFor(ch, overrideId ? pickFont(fonts, overrideId) : runFont, fonts);
      const k = s / font.unitsPerEm;
      if (prev && prev.font === font) x += font.getKerningValue(prev.glyph, glyph) * k;
      const advance = (glyph.advanceWidth ?? 0) * k + run.style.tracking * s;
      glyphs.push({ font, glyph, x, rise: run.style.rise * size, size: s, fill: run.style.fill, advance });
      x += advance;
      lastTracking = run.style.tracking * s;
      prev = { font, glyph };
    }
  }
  return { glyphs, width: Math.max(0, x - lastTracking) };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100;

function pathData(cmds: PathCommand[], tx: (x: number, y: number) => [number, number]): string {
  let d = '';
  for (const c of cmds) {
    if (c.type === 'M' || c.type === 'L') {
      const [x, y] = tx(c.x, c.y);
      d += `${c.type}${r2(x)} ${r2(y)}`;
    } else if (c.type === 'Q') {
      const [x1, y1] = tx(c.x1, c.y1);
      const [x, y] = tx(c.x, c.y);
      d += `Q${r2(x1)} ${r2(y1)} ${r2(x)} ${r2(y)}`;
    } else if (c.type === 'C') {
      const [x1, y1] = tx(c.x1, c.y1);
      const [x2, y2] = tx(c.x2, c.y2);
      const [x, y] = tx(c.x, c.y);
      d += `C${r2(x1)} ${r2(y1)} ${r2(x2)} ${r2(y2)} ${r2(x)} ${r2(y)}`;
    } else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

function extendBox(b: Bounds, cmds: PathCommand[], tx: (x: number, y: number) => [number, number]) {
  for (const c of cmds) {
    if (c.type === 'Z') continue;
    const [x, y] = tx(c.x, c.y);
    if (x < b.x1) b.x1 = x;
    if (y < b.y1) b.y1 = y;
    if (x > b.x2) b.x2 = x;
    if (y > b.y2) b.y2 = y;
  }
}

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const emptyBounds = (): Bounds => ({ x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
const toBox = (b: Bounds): Box =>
  Number.isFinite(b.x1) ? { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 } : { x: 0, y: 0, w: 0, h: 0 };

/** Glyph outlines, already positioned, grouped by fill color. */
export interface Ink {
  pieces: { fill: string; d: string }[];
  bbox: Box;
  size: number;
}

export interface Effects {
  shadow?: { dx: number; dy: number; color: string };
  outline?: { width: number; color: string };
}

function collect(glyphs: { cmds: PathCommand[]; fill: string; tx: (x: number, y: number) => [number, number] }[]): {
  pieces: { fill: string; d: string }[];
  bounds: Bounds;
} {
  const byFill = new Map<string, string>();
  const bounds = emptyBounds();
  for (const g of glyphs) {
    if (!g.cmds.length) continue;
    byFill.set(g.fill, (byFill.get(g.fill) ?? '') + pathData(g.cmds, g.tx));
    extendBox(bounds, g.cmds, g.tx);
  }
  return { pieces: [...byFill.entries()].map(([fill, d]) => ({ fill, d })), bounds };
}

/** Shifts already-laid-out ink. */
export function moveInk(ink: Ink, dx: number, dy: number): Ink {
  if (!dx && !dy) return ink;
  return {
    ...ink,
    pieces: ink.pieces.map((p) => ({ ...p, d: shiftPathData(p.d, dx, dy) })),
    bbox: { ...ink.bbox, x: ink.bbox.x + dx, y: ink.bbox.y + dy },
  };
}

function shiftPathData(d: string, dx: number, dy: number): string {
  // Our path data only contains absolute M/L/Q/C/Z with x y pairs.
  return d.replace(/([MLQC])([^MLQCZ]*)/g, (_m, cmd: string, nums: string) => {
    const v = nums.trim().split(/[\s,]+/).map(Number);
    const out: number[] = [];
    for (let i = 0; i < v.length; i += 2) out.push(r2(v[i] + dx), r2(v[i + 1] + dy));
    return cmd + out.join(' ');
  });
}

/** Serialises ink to SVG, with optional shadow and outline layers. */
export function inkToSvg(ink: Ink, fx?: Effects): string {
  if (!ink.pieces.length) return '';
  const all = ink.pieces.map((p) => p.d).join('');
  let out = '';
  if (fx?.shadow) {
    out += `<path d="${shiftPathData(all, fx.shadow.dx, fx.shadow.dy)}" fill="${fx.shadow.color}"/>`;
  }
  if (fx?.outline) {
    out += `<path d="${all}" fill="${fx.outline.color}" stroke="${fx.outline.color}" stroke-width="${r2(fx.outline.width)}" stroke-linejoin="round"/>`;
  }
  for (const p of ink.pieces) out += `<path d="${p.d}" fill="${p.fill}"/>`;
  return out;
}

// ---------------------------------------------------------------------------
// Straight text blocks
// ---------------------------------------------------------------------------

export interface BlockOptions {
  text: string;
  style: TextStyle;
  fonts: FontSet;
  box: Box;
  maxLines: number;
  align?: 'center' | 'left' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  maxSize: number;
  /** Prefer this many lines when it costs little size. */
  preferLines?: number;
}

function splitWords(text: string): string[] {
  return text.split(/[ \t]+/).filter(Boolean);
}

/** How many ways there are to cut `words` words into `n` lines, stopping once it passes `limit`. */
function partitionCount(words: number, n: number, limit: number): number {
  let c = 1;
  for (let i = 0; i < n - 1; i++) {
    c = (c * (words - 1 - i)) / (i + 1);
    if (c > limit) return Infinity;
  }
  return c;
}

/** Past this many ways to break a line, fill lines greedily instead of trying them all. */
const MAX_PARTITIONS = 4000;

/** Fills `n` lines to roughly equal width, one word at a time. */
function greedyLines(words: string[], n: number, measure: (line: string) => number): string[] {
  const target = measure(words.join(' ')) / n;
  const lines: string[] = [];
  let line: string[] = [];
  words.forEach((w, i) => {
    const left = words.length - i;
    const linesLeft = n - lines.length;
    if (line.length && linesLeft > 1 && (measure([...line, w].join(' ')) > target || left < linesLeft)) {
      lines.push(line.join(' '));
      line = [];
    }
    line.push(w);
  });
  if (line.length) lines.push(line.join(' '));
  return lines;
}

/** All ways to cut `words` into `n` contiguous lines. */
function partitions(words: string[], n: number): string[][] {
  if (n === 1) return [[words.join(' ')]];
  if (words.length < n) return [];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - n + 1; i++) {
    const head = words.slice(0, i).join(' ');
    for (const rest of partitions(words.slice(i), n - 1)) out.push([head, ...rest]);
  }
  return out;
}

/** Picks line breaks and size so the text fills the box as large as possible. */
export function chooseLines(o: BlockOptions): { lines: string[]; size: number } {
  const lh = o.style.role.lineHeight ?? 1.05;
  // The same line comes up in many candidate breaks; shape each one once.
  const widths = new Map<string, number>();
  const measure = (line: string) => {
    let w = widths.get(line);
    if (w === undefined) {
      w = shape(runsFor(line, o.style), o.fonts, 1).width;
      widths.set(line, w);
    }
    return w;
  };
  const prepared = smartQuotes(o.text.trim());
  const forced = prepared.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const candidates: string[][] = [];
  if (forced.length > 1) candidates.push(forced);
  else {
    const words = splitWords(forced[0] ?? '');
    if (!words.length) return { lines: [], size: 0 };
    for (let n = 1; n <= Math.min(o.maxLines, words.length); n++) {
      // Balanced: minimise the widest line, then prefer even lines. An "&" on a
      // line by itself never happens, and starting a line with one costs a little.
      if (partitionCount(words.length, n, MAX_PARTITIONS) > MAX_PARTITIONS) {
        candidates.push(greedyLines(words, n, measure));
        continue;
      }
      let best: string[] | null = null;
      let bestCost = Infinity;
      for (const p of partitions(words, n)) {
        const widths = p.map((line) => {
          const w = measure(line);
          const t = line.trim();
          return t === '&' ? w * 50 : t.startsWith('&') ? w * 1.06 : w;
        });
        const maxW = Math.max(...widths);
        const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
        const spread = widths.reduce((a, w) => a + (w - mean) ** 2, 0) / widths.length;
        const cost = maxW + 0.02 * Math.sqrt(spread);
        if (cost < bestCost) {
          bestCost = cost;
          best = p;
        }
      }
      if (best) candidates.push(best);
    }
  }

  let pick = candidates[0];
  let pickScore = -Infinity;
  let pickSize = 0;
  for (const lines of candidates) {
    const widest = Math.max(...lines.map(measure));
    const blockEm = lh * (lines.length - 1) + 0.95;
    const size = Math.min(o.maxSize, o.box.w / Math.max(widest, 0.01), o.box.h / blockEm);
    // Bigger is better, but don't chop into many short lines for a tiny gain.
    let score = size * (1 - 0.06 * (lines.length - 1));
    if (o.preferLines && lines.length === o.preferLines) score *= 1.12;
    if (score > pickScore) {
      pickScore = score;
      pick = lines;
      pickSize = size;
    }
  }
  return { lines: pick, size: pickSize };
}

export function layoutBlock(o: BlockOptions): Ink {
  const { lines, size } = chooseLines(o);
  if (!lines.length || size <= 0) return { pieces: [], bbox: { x: o.box.x, y: o.box.y, w: 0, h: 0 }, size: 0 };
  return layoutLines(lines, size, o);
}

/** Lays out explicit lines at an explicit size inside o.box. */
export function layoutLines(lines: string[], size: number, o: Omit<BlockOptions, 'maxLines' | 'maxSize'>): Ink {
  const lh = o.style.role.lineHeight ?? 1.05;
  const align = o.align ?? 'center';
  const glyphs: { cmds: PathCommand[]; fill: string; tx: (x: number, y: number) => [number, number] }[] = [];
  const shaped = lines.map((l) => shape(runsFor(l, o.style), o.fonts, size));
  const widest = Math.max(...shaped.map((s) => s.width));
  shaped.forEach((s, i) => {
    const baseline = i * lh * size;
    const x0 = align === 'center' ? (widest - s.width) / 2 : align === 'right' ? widest - s.width : 0;
    for (const g of s.glyphs) {
      const p: Path = g.glyph.getPath(x0 + g.x, baseline - g.rise, g.size);
      glyphs.push({ cmds: p.commands, fill: g.fill, tx: (x, y) => [x, y] });
    }
  });
  const { pieces, bounds } = collect(glyphs);
  const bbox = toBox(bounds);
  // Position by ink bounds, which looks centered to the eye.
  const valign = o.valign ?? 'center';
  const dx =
    align === 'center'
      ? o.box.x + (o.box.w - bbox.w) / 2 - bbox.x
      : align === 'left'
        ? o.box.x - bbox.x
        : o.box.x + o.box.w - (bbox.x + bbox.w);
  const dy =
    valign === 'top' ? o.box.y - bbox.y : valign === 'bottom' ? o.box.y + o.box.h - (bbox.y + bbox.h) : o.box.y + (o.box.h - bbox.h) / 2 - bbox.y;
  return moveInk({ pieces, bbox, size }, dx, dy);
}

// ---------------------------------------------------------------------------
// Text on a circle
// ---------------------------------------------------------------------------

export interface ArcOptions {
  text: string;
  style: TextStyle;
  fonts: FontSet;
  cx: number;
  cy: number;
  /** Radius of the inner edge of the text band. */
  r: number;
  side: 'top' | 'bottom';
  maxSpanDeg: number;
  maxSize: number;
}

export function layoutArc(o: ArcOptions): Ink {
  const text = smartQuotes(o.text.trim()).replace(/\s*\n+\s*/g, ' ');
  if (!text) return { pieces: [], bbox: { x: o.cx, y: o.cy, w: 0, h: 0 }, size: 0 };
  const runs = runsFor(text, o.style);
  const unit = shape(runs, o.fonts, 1).width;
  const baseFont = pickFont(o.fonts, o.style.role.font);
  const capEm = ((baseFont.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? baseFont.ascender * 0.7) / baseFont.unitsPerEm;
  const span = (o.maxSpanDeg * Math.PI) / 180;
  let size = Math.min(o.maxSize, (o.r * span) / Math.max(unit, 0.01));
  if (o.side === 'bottom') size = Math.min(o.maxSize, ((o.r + capEm * size) * span) / Math.max(unit, 0.01));
  const radius = o.side === 'top' ? o.r : o.r + capEm * size;
  const { glyphs: placed, width } = shape(runs, o.fonts, size);
  const total = width / radius;
  const start = o.side === 'top' ? -total / 2 : Math.PI + total / 2;

  const glyphs = placed.map((g) => {
    const mid = g.x + g.advance / 2;
    const phi = o.side === 'top' ? start + mid / radius : start - mid / radius;
    const rot = o.side === 'top' ? phi : phi - Math.PI;
    const px = o.cx + radius * Math.sin(phi);
    const py = o.cy - radius * Math.cos(phi);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const local: Path = g.glyph.getPath(-g.advance / 2, -g.rise, g.size);
    const tx = (x: number, y: number): [number, number] => [px + x * cos - y * sin, py + x * sin + y * cos];
    return { cmds: local.commands, fill: g.fill, tx };
  });
  const { pieces, bounds } = collect(glyphs);
  return { pieces, bbox: toBox(bounds), size };
}

/** Cap height of a font, em. Handy for layouts. */
export function capHeightEm(fonts: FontSet, id: string): number {
  const f = pickFont(fonts, id);
  return ((f.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? f.ascender * 0.7) / f.unitsPerEm;
}
