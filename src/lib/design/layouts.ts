// Layout templates. Each one arranges art + headline + tagline + extra on the
// 1500 x 1800 canvas and reports the ink bounds; render.ts then fits the result
// to the canvas. Coordinates are in canvas units.
import { wordInks, type WordInks } from './colors';
import { motifSvg } from './motifs';
import { capHeightEm, chooseLines, inkToSvg, layoutArc, layoutBlock, layoutLines, type Effects, type Ink, type TextStyle } from './text';
import type { ArtRef, Box, Copy, Emphasis, FontSet, Inks, LayoutId, MotifId, Pairing, RenderContext, ShirtDesign, TextRole } from './types';

export interface Composed {
  svg: string;
  bbox: Box;
}

interface Kit {
  design: ShirtDesign;
  ctx: RenderContext;
  inks: Inks;
  pairing: Pairing;
  emphasis: Emphasis;
  copy: Copy;
  fonts: FontSet;
  /** What each part of the lettering prints in. */
  words: WordInks;
}

const f = (n: number) => Math.round(n * 10) / 10;

// --- bounds helpers -----------------------------------------------------------

function union(...boxes: (Box | null | undefined)[]): Box {
  const list = boxes.filter((b): b is Box => !!b && (b.w > 0 || b.h > 0));
  if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(...list.map((b) => b.x));
  const y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w));
  const y2 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const bottom = (b: Box) => b.y + b.h;

function rotateBox(b: Box, deg: number, cx: number, cy: number): Box {
  const a = (deg * Math.PI) / 180;
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// --- text helpers ---------------------------------------------------------------

function style(k: Kit, role: TextRole, extra: Partial<TextStyle> = {}): TextStyle {
  return { role, pairing: k.pairing, inks: k.inks, emphasis: k.emphasis, ...extra };
}

/** The big words' style, in their colors. */
const headStyle = (k: Kit, role: TextRole = k.pairing.headline, extra: Partial<TextStyle> = {}) =>
  style(k, role, { fill: k.words.headline, accentFill: k.words.emphasis, ...extra });

function headlineFx(k: Kit, size: number): Effects | undefined {
  const fx: Effects = {};
  if (k.design.shadow) fx.shadow = { dx: size * 0.055, dy: size * 0.055, color: k.words.shadow };
  if (k.design.outline) fx.outline = { width: size * 0.09, color: k.words.outline };
  return fx.shadow || fx.outline ? fx : undefined;
}

function headline(k: Kit, box: Box, maxLines: number, maxSize: number, opts: { align?: 'center' | 'left'; valign?: 'top' | 'center'; prefer?: number } = {}): Ink {
  const hs = k.design.headlineScale ?? 1;
  return layoutBlock({
    text: k.copy.headline,
    style: headStyle(k),
    fonts: k.fonts,
    box: { ...box, h: box.h * hs },
    maxLines,
    maxSize: maxSize * hs,
    align: opts.align ?? 'center',
    valign: opts.valign ?? 'top',
    preferLines: opts.prefer,
  });
}

function tagline(k: Kit, box: Box, maxSize: number, opts: { align?: 'center' | 'left'; maxLines?: number } = {}): Ink {
  const ts = k.design.taglineScale ?? 1;
  return layoutBlock({
    text: k.copy.tagline,
    style: style(k, k.pairing.tagline, { fill: k.words.tagline, accentFill: k.words.taglineEmphasis }),
    fonts: k.fonts,
    box: { ...box, h: box.h * ts },
    maxLines: opts.maxLines ?? 2,
    maxSize: maxSize * ts,
    align: opts.align ?? 'center',
    valign: 'top',
    preferLines: 1,
  });
}

function extraLine(k: Kit, box: Box, maxSize: number): Ink {
  return layoutBlock({
    text: k.copy.extra,
    style: style(k, k.pairing.extra, { fill: k.words.extra }),
    fonts: k.fonts,
    box,
    maxLines: 1,
    maxSize,
    valign: 'top',
  });
}

const svgOf = (ink: Ink, fx?: Effects) => inkToSvg(ink, fx);

// --- art --------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function artSvg(art: ArtRef, box: Box, k: Kit, opts: { line?: boolean; motifOverride?: MotifId; inks?: Inks } = {}): string {
  const scale = k.design.artScale ?? 1;
  const w = box.w * scale;
  const h = box.h * scale;
  const b = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  if (art.kind === 'none') return '';
  if (art.kind === 'motif') {
    const id = opts.motifOverride ?? art.motif;
    if (id === 'none') return '';
    const s = Math.min(b.w, b.h) / 1000;
    const tx = b.x + (b.w - 1000 * s) / 2;
    const ty = b.y + (b.h - 1000 * s) / 2;
    return `<g transform="translate(${f(tx)} ${f(ty)}) scale(${Math.round(s * 10000) / 10000})">${motifSvg(id, opts.inks ?? k.inks, { line: opts.line ?? art.line })}</g>`;
  }
  const href = escapeAttr(k.ctx.assetHref(art.assetKey));
  return `<image href="${href}" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" preserveAspectRatio="xMidYMid meet"/>`;
}

const hasArt = (art: ArtRef) => !(art.kind === 'none' || (art.kind === 'motif' && art.motif === 'none'));

// --- layouts ------------------------------------------------------------------------

function stack(k: Kit): Composed {
  let svg = '';
  let y = 0;
  const parts: Box[] = [];
  if (hasArt(k.design.art)) {
    const box = { x: 290, y: 0, w: 920, h: 820 };
    svg += artSvg(k.design.art, box, k);
    parts.push(box);
    y = 860;
  }
  const H = headline(k, { x: 60, y, w: 1380, h: 520 }, 3, 330, { prefer: 2 });
  svg += svgOf(H, headlineFx(k, H.size));
  parts.push(H.bbox);
  y = bottom(H.bbox) + 55;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 170, y, w: 1160, h: 240 }, 190);
    svg += svgOf(T);
    parts.push(T.bbox);
    y = bottom(T.bbox) + 50;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 330, y, w: 840, h: 70 }, 62);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function badge(k: Kit): Composed {
  const cx = 750;
  const cy = 700;
  const R = 400;
  const ring = k.inks.art;
  let svg = '';
  const parts: Box[] = [];

  svg += artSvg(k.design.art, { x: cx - R * 0.94, y: cy - R * 0.94, w: R * 1.88, h: R * 1.88 }, k);

  const prep = chooseLines({
    text: k.copy.headline,
    style: headStyle(k),
    fonts: k.fonts,
    box: { x: 0, y: 0, w: 1000, h: 400 },
    maxLines: 2,
    maxSize: 400,
    preferLines: 2,
  });
  const [topText, bottomText] = prep.lines.length > 1 ? prep.lines : [prep.lines[0] ?? '', ''];
  const textR = R + 46;
  const hs = k.design.headlineScale ?? 1;
  const top = layoutArc({ text: topText, style: headStyle(k), fonts: k.fonts, cx, cy, r: textR, side: 'top', maxSpanDeg: 150, maxSize: 190 * hs });
  const bot = bottomText
    ? layoutArc({ text: bottomText, style: headStyle(k), fonts: k.fonts, cx, cy, r: textR, side: 'bottom', maxSpanDeg: 130, maxSize: 190 * hs })
    : null;
  const size = Math.max(top.size, bot?.size ?? 0);
  const band = capHeightEm(k.fonts, k.pairing.headline.font) * size;
  const outerR = textR + band + 40;
  // rings
  svg += `<circle cx="${cx}" cy="${cy}" r="${f(R + 16)}" fill="none" stroke="${ring}" stroke-width="12"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${f(outerR)}" fill="none" stroke="${ring}" stroke-width="16"/>`;
  svg += svgOf(top, headlineFx(k, top.size));
  if (bot) svg += svgOf(bot, headlineFx(k, bot.size));
  // dots between the two arcs
  if (bot) {
    for (const side of [-1, 1]) {
      const a = (side * 90 * Math.PI) / 180;
      const rr = textR + band / 2;
      svg += `<circle cx="${f(cx + Math.sin(a) * rr)}" cy="${f(cy - Math.cos(a) * rr)}" r="${f(Math.max(10, band * 0.14))}" fill="${k.inks.accent}"/>`;
    }
  }
  parts.push({ x: cx - outerR - 8, y: cy - outerR - 8, w: 2 * outerR + 16, h: 2 * outerR + 16 });
  let y = cy + outerR + 60;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 150, y, w: 1200, h: 230 }, 190);
    svg += svgOf(T);
    parts.push(T.bbox);
    y = bottom(T.bbox) + 45;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 330, y, w: 840, h: 70 }, 60);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function arch(k: Kit): Composed {
  let svg = '';
  const parts: Box[] = [];
  const prep = chooseLines({
    text: k.copy.headline,
    style: headStyle(k),
    fonts: k.fonts,
    box: { x: 0, y: 0, w: 1300, h: 500 },
    maxLines: 2,
    maxSize: 400,
    preferLines: 2,
  });
  const [line1, ...rest] = prep.lines;
  const hs = k.design.headlineScale ?? 1;
  const arc = layoutArc({
    text: line1 ?? '',
    style: headStyle(k),
    fonts: k.fonts,
    cx: 750,
    cy: 1300,
    r: 1020,
    side: 'top',
    maxSpanDeg: 68,
    maxSize: 250 * hs,
  });
  svg += svgOf(arc, headlineFx(k, arc.size));
  parts.push(arc.bbox);
  let y = bottom(arc.bbox) + 40;
  if (hasArt(k.design.art)) {
    const box = { x: 330, y, w: 840, h: 760 };
    svg += artSvg(k.design.art, box, k);
    parts.push(box);
    y += 790;
  }
  if (rest.length) {
    const L2 = layoutLines([rest.join(' ')], arc.size * 1.05, {
      text: '',
      style: headStyle(k),
      fonts: k.fonts,
      box: { x: 60, y, w: 1380, h: 300 },
      valign: 'top',
    });
    // Shrink if the straight line is wider than the canvas.
    const fit = L2.bbox.w > 1380 ? layoutBlock({ text: rest.join(' '), style: headStyle(k), fonts: k.fonts, box: { x: 60, y, w: 1380, h: 300 }, maxLines: 1, maxSize: arc.size, valign: 'top' }) : L2;
    svg += svgOf(fit, headlineFx(k, fit.size));
    parts.push(fit.bbox);
    y = bottom(fit.bbox) + 50;
  }
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 170, y, w: 1160, h: 220 }, 180);
    svg += svgOf(T);
    parts.push(T.bbox);
    y = bottom(T.bbox) + 45;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 330, y, w: 840, h: 70 }, 60);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function bigtype(k: Kit): Composed {
  let svg = '';
  const parts: Box[] = [];
  let y = 0;
  if (hasArt(k.design.art)) {
    const box = { x: 500, y: 0, w: 500, h: 420 };
    svg += artSvg(k.design.art, box, k);
    parts.push(box);
    y = 440;
  }
  const H = headline(k, { x: 40, y, w: 1420, h: 980 }, 4, 430, { prefer: 3 });
  svg += svgOf(H, headlineFx(k, H.size));
  parts.push(H.bbox);
  y = bottom(H.bbox) + 30;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 200, y: y + 20, w: 1100, h: 260 }, 230, { maxLines: 1 });
    const cx = T.bbox.x + T.bbox.w / 2;
    const cy = T.bbox.y + T.bbox.h / 2;
    svg += `<g transform="rotate(-6 ${f(cx)} ${f(cy)})">${svgOf(T)}</g>`;
    const rb = rotateBox(T.bbox, -6, cx, cy);
    parts.push(rb);
    y = bottom(rb) + 40;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 330, y, w: 840, h: 70 }, 60);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function ticketOutline(x: number, y: number, w: number, h: number, r: number, px: number, nr: number): string {
  return [
    `M${x + r} ${y}`,
    `L${px - nr} ${y}`,
    `A${nr} ${nr} 0 0 0 ${px + nr} ${y}`,
    `L${x + w - r} ${y}`,
    `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `L${x + w} ${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `L${px + nr} ${y + h}`,
    `A${nr} ${nr} 0 0 0 ${px - nr} ${y + h}`,
    `L${x + r} ${y + h}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `L${x} ${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join('');
}

function ticket(k: Kit): Composed {
  const ink = k.inks.art;
  const t = k.design.ticket ?? { from: 'HOME', to: 'AWAY', date: '' };
  const X = 40;
  const Y = 40;
  const W = 1420;
  const Hh = 780;
  const PX = 1090;
  let svg = `<path d="${ticketOutline(X, Y, W, Hh, 46, PX, 34)}" fill="none" stroke="${ink}" stroke-width="14"/>`;
  svg += `<path d="M${PX} ${Y + 50}L${PX} ${Y + Hh - 50}" stroke="${ink}" stroke-width="8" stroke-dasharray="18 18"/>`;

  const small = (text: string, box: Box, size: number, fill = k.inks.accent) =>
    layoutBlock({ text, style: style(k, { ...k.pairing.extra, upper: true }, { fill, emphasis: 'none' }), fonts: k.fonts, box, maxLines: 1, maxSize: size, align: 'left', valign: 'top' });
  const big = (text: string, box: Box, size: number) =>
    layoutBlock({ text, style: headStyle(k, { ...k.pairing.headline, upper: true }, { emphasis: 'none' }), fonts: k.fonts, box, maxLines: 1, maxSize: size, align: 'left', valign: 'top' });

  svg += svgOf(small('Boarding Pass', { x: 100, y: 95, w: 600, h: 60 }, 46));
  svg += `<g transform="translate(985 125) rotate(90) scale(0.42)"><path d="M0 -100L9 -86L12 -30L95 12L95 28L12 6L9 62L36 84L36 96L0 86L-36 96L-36 84L-9 62L-12 6L-95 28L-95 12L-12 -30L-9 -86Z" fill="${ink}"/></g>`;

  const H = headline(k, { x: 100, y: 180, w: 940, h: 360 }, 3, 165, { align: 'left', prefer: 2 });
  svg += svgOf(H, headlineFx(k, H.size));

  const fields: [string, string][] = [
    ['From', t.from],
    ['To', t.to],
    ['Date', t.date],
  ];
  fields.forEach(([label, value], i) => {
    const fx = 100 + i * 320;
    svg += svgOf(small(label, { x: fx, y: 610, w: 290, h: 40 }, 34));
    svg += svgOf(big(value, { x: fx, y: 660, w: 290, h: 120 }, 110));
  });

  // A short number in the headline makes a fun gate ("31st" → 31); a year doesn't.
  const gate = k.copy.headline.match(/(?<!\d)\d{1,3}(?!\d)/)?.[0] ?? '1';
  svg += svgOf(small('Gate', { x: 1140, y: 120, w: 280, h: 40 }, 34));
  svg += svgOf(big(gate, { x: 1140, y: 170, w: 280, h: 170 }, 160));
  svg += svgOf(small('Seats', { x: 1140, y: 400, w: 280, h: 40 }, 34));
  svg += svgOf(big(t.seats || '1A 1B', { x: 1140, y: 450, w: 280, h: 110 }, 95));
  svg += svgOf(small('Class', { x: 1140, y: 610, w: 280, h: 40 }, 34));
  svg += svgOf(big('First', { x: 1140, y: 660, w: 280, h: 120 }, 95));

  const parts: Box[] = [{ x: X - 7, y: Y - 7, w: W + 14, h: Hh + 14 }];
  let y = Y + Hh + 70;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 150, y, w: 1200, h: 230 }, 190);
    svg += svgOf(T);
    parts.push(T.bbox);
    y = bottom(T.bbox) + 45;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 330, y, w: 840, h: 70 }, 60);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function stamp(k: Kit): Composed {
  // One ink, like a passport stamp.
  const ink = k.inks.text;
  const mono: Inks = { ...k.inks, art: ink, sun: [ink], water: [ink], accent: ink, panel: ink };
  // Any color picked for particular words still wins.
  const kk: Kit = { ...k, inks: mono, words: wordInks(mono, k.design.colors) };
  let svg = '';
  const parts: Box[] = [];
  let y = 120;
  if (hasArt(k.design.art)) {
    const box = { x: 560, y, w: 380, h: 300 };
    svg += artSvg(k.design.art, box, kk, { line: k.design.art.kind === 'motif' ? true : undefined, inks: mono });
    parts.push(box);
    y += 330;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(kk, { x: 330, y, w: 840, h: 70 }, 58);
    svg += svgOf(E);
    parts.push(E.bbox);
    y = bottom(E.bbox) + 40;
  }
  const H = headline(kk, { x: 190, y, w: 1120, h: 460 }, 3, 220, { prefer: 2 });
  svg += svgOf(H);
  parts.push(H.bbox);
  y = bottom(H.bbox) + 45;
  if (k.copy.tagline.trim()) {
    const T = tagline(kk, { x: 260, y, w: 980, h: 200 }, 150);
    svg += svgOf(T);
    parts.push(T.bbox);
  }
  const content = union(...parts);
  const pad = 70;
  const bx = content.x - pad;
  const by = content.y - pad;
  const bw = content.w + pad * 2;
  const bh = content.h + pad * 2;
  const border =
    `<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="60" fill="none" stroke="${ink}" stroke-width="18"/>` +
    `<rect x="${f(bx + 30)}" y="${f(by + 30)}" width="${f(bw - 60)}" height="${f(bh - 60)}" rx="40" fill="none" stroke="${ink}" stroke-width="6"/>`;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const outer = { x: bx - 9, y: by - 9, w: bw + 18, h: bh + 18 };
  return {
    svg: `<g transform="rotate(-6 ${f(cx)} ${f(cy)})">${border}${svg}</g>`,
    bbox: rotateBox(outer, -6, cx, cy),
  };
}

function minimal(k: Kit): Composed {
  let svg = '';
  const parts: Box[] = [];
  let y = 0;
  if (hasArt(k.design.art)) {
    const box = { x: 530, y: 0, w: 440, h: 420 };
    svg += artSvg(k.design.art, box, k, { line: k.design.art.kind === 'motif' ? (k.design.art.line ?? true) : undefined });
    parts.push(box);
    y = 470;
  }
  const H = headline(k, { x: 200, y, w: 1100, h: 330 }, 2, 150, { prefer: 2 });
  svg += svgOf(H, headlineFx(k, H.size));
  parts.push(H.bbox);
  y = bottom(H.bbox) + 40;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 330, y, w: 840, h: 150 }, 100);
    svg += svgOf(T);
    parts.push(T.bbox);
    y = bottom(T.bbox) + 35;
  }
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 450, y, w: 600, h: 50 }, 44);
    svg += svgOf(E);
    parts.push(E.bbox);
  }
  return { svg, bbox: union(...parts) };
}

function poster(k: Kit): Composed {
  let svg = '';
  const parts: Box[] = [];
  let y = 0;
  if (k.copy.extra.trim()) {
    const E = extraLine(k, { x: 150, y: 0, w: 1200, h: 130 }, 120);
    svg += svgOf(E);
    parts.push(E.bbox);
    y = bottom(E.bbox) + 50;
  }
  const frame = { x: 170, y, w: 1160, h: 1000 };
  svg += `<rect x="${frame.x}" y="${f(frame.y)}" width="${frame.w}" height="${frame.h}" rx="56" fill="${k.inks.panel}"/>`;
  const art: ArtRef = hasArt(k.design.art) ? k.design.art : { kind: 'motif', motif: 'sunset-palm' };
  svg += artSvg(art, { x: frame.x + 40, y: frame.y + 30, w: frame.w - 80, h: frame.h - 40 }, k);
  svg += `<rect x="${frame.x}" y="${f(frame.y)}" width="${frame.w}" height="${frame.h}" rx="56" fill="none" stroke="${k.inks.art}" stroke-width="16"/>`;
  parts.push({ x: frame.x - 8, y: frame.y - 8, w: frame.w + 16, h: frame.h + 16 });
  y = frame.y + frame.h + 60;
  const H = headline(k, { x: 60, y, w: 1380, h: 420 }, 3, 260, { prefer: 2 });
  svg += svgOf(H, headlineFx(k, H.size));
  parts.push(H.bbox);
  y = bottom(H.bbox) + 45;
  if (k.copy.tagline.trim()) {
    const T = tagline(k, { x: 200, y, w: 1100, h: 200 }, 170);
    svg += svgOf(T);
    parts.push(T.bbox);
  }
  return { svg, bbox: union(...parts) };
}

export const LAYOUTS: Record<LayoutId, { name: string; build: (k: Kit) => Composed }> = {
  stack: { name: 'Classic Stack', build: stack },
  badge: { name: 'Round Badge', build: badge },
  arch: { name: 'Varsity Arch', build: arch },
  bigtype: { name: 'Big Type', build: bigtype },
  ticket: { name: 'Boarding Pass', build: ticket },
  stamp: { name: 'Passport Stamp', build: stamp },
  minimal: { name: 'Minimal', build: minimal },
  poster: { name: 'Travel Poster', build: poster },
};

export type { Kit };
