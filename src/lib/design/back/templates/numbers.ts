// By the Numbers: the stats, as a grid, a stat sheet, or a till receipt.
import { bottom, draw, f, measure, rule, text, union, type BackKit, type Composed } from '../kit';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

const stats = (k: BackKit) => k.facts.stats.filter((s) => s.value.trim() || s.label.trim());

function grid(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const H = text(k, 'By the Numbers', { role: 'headline', box: { x: 80, y: 0, w: 1340, h: 220 }, size: 190, upper: true });
  svg += draw(H);
  parts.push(H.bbox);
  let y = bottom(H.bbox) + 40;
  const S = text(k, k.facts.signature, { role: 'label', box: { x: 230, y, w: 1040, h: 60 }, size: 50, fill: k.inks.accent });
  svg += draw(S);
  parts.push(S.bbox);
  y = (S.size ? bottom(S.bbox) : y) + 80;

  const list = stats(k);
  const cols = list.length <= 4 ? 2 : list.length <= 6 ? 2 : 3;
  const rows = Math.ceil(list.length / cols);
  const cw = 1340 / cols;
  const ch = Math.min(400, 1150 / Math.max(1, rows));
  list.forEach((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = 80 + c * cw;
    const cy = y + r * ch;
    const fill = (r + c) % 2 ? k.inks.accent : k.inks.text;
    const V = text(k, s.value, { role: 'headline', box: { x: x + 30, y: cy + ch * 0.08, w: cw - 60, h: ch * 0.6 }, size: ch * 0.62, fill, valign: 'bottom' });
    const L = text(k, s.label, { role: 'label', box: { x: x + 30, y: cy + ch * 0.74, w: cw - 60, h: ch * 0.16 }, size: ch * 0.13 });
    svg += draw(V) + draw(L);
    parts.push(V.bbox, L.bbox);
  });
  // Hairlines between the cells.
  for (let c = 1; c < cols; c++) svg += rule(80 + c * cw, y + 30, 80 + c * cw, y + rows * ch - 30, k.inks.art, 5);
  for (let r = 1; r < rows; r++) svg += rule(110, y + r * ch, 80 + 1340 - 30, y + r * ch, k.inks.art, 5);
  return { svg, bbox: union(...parts) };
}

/** Numbers right-aligned against their labels, like a stat sheet. */
function sheet(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const T = text(k, k.facts.title, { role: 'script', box: { x: 120, y: 0, w: 1260, h: 220 }, size: 170, lines: 2, prefer: 1, fill: k.inks.accent });
  svg += draw(T);
  parts.push(T.bbox);
  let y = bottom(T.bbox) + 90;
  const list = stats(k);
  const vw = Math.max(0.01, ...list.map((s) => measure(k, s.value)));
  const lw = Math.max(0.01, ...list.map((s) => measure(k, s.label, { role: 'headline', upper: true })));
  const per = Math.min(260, 1300 / Math.max(1, list.length));
  // Labels at 45% of the number's size.
  const size = Math.min(per * 0.9, 1240 / (vw + lw * 0.45 + 0.25));
  const gap = size * 0.25;
  const x0 = 750 - (vw * size + gap + lw * size * 0.45) / 2;
  list.forEach((s) => {
    const V = text(k, s.value, { role: 'headline', box: { x: x0, y, w: vw * size, h: size }, size, exact: true, align: 'right', fill: k.inks.accent });
    const L = text(k, s.label, {
      role: 'headline',
      box: { x: x0 + vw * size + gap, y: V.bbox.y + V.bbox.h - size * 0.45 * 0.72, w: lw * size * 0.45, h: size * 0.45 },
      size: size * 0.45,
      exact: true,
      align: 'left',
      valign: 'top',
      upper: true,
    });
    svg += draw(V) + draw(L);
    parts.push(V.bbox, L.bbox);
    y = bottom(V.bbox) + size * 0.32;
  });
  const S = text(k, k.facts.signature, { role: 'label', box: { x: 230, y: y + 40, w: 1040, h: 60 }, size: 50 });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

function zigzag(x1: number, x2: number, y: number, tooth: number, down: boolean): string {
  let d = '';
  const n = Math.max(1, Math.round(Math.abs(x2 - x1) / tooth));
  const step = (x2 - x1) / n;
  for (let i = 0; i < n; i++) {
    d += `L${f(x1 + step * (i + 0.5))} ${f(y + (down ? tooth * 0.5 : -tooth * 0.5))}L${f(x1 + step * (i + 1))} ${f(y)}`;
  }
  return d;
}

/** A till receipt. Total: priceless. */
function receipt(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const W = 34;
  const x0 = 220;
  const w = 1060;
  const charW = measure(k, 'M'.repeat(W), { role: 'mono' });
  const size = w / charW;
  const lineH = size * 1.55;
  const top = 0;
  let y = top + 90;
  const line = (t: string, opts: { bold?: boolean; quiet?: boolean; fill?: string } = {}) => {
    const L = text(k, t, { role: opts.bold ? 'monoBold' : 'mono', box: { x: x0, y, w, h: size }, size, exact: true, align: 'left', quiet: opts.quiet, fill: opts.fill });
    svg += draw(L);
    y += lineH;
    return L;
  };
  const center = (t: string, bold = false) => {
    const L = text(k, t, { role: bold ? 'monoBold' : 'mono', box: { x: x0, y, w, h: lineH * 2 }, size, lines: 2, align: 'center' });
    svg += draw(L);
    y = bottom(L.bbox) + lineH - size;
  };
  center(k.facts.title, true);
  if (k.facts.dates) center(k.facts.dates);
  y += lineH * 0.4;
  const dashes = '-'.repeat(W);
  line(dashes, { quiet: true });
  for (const s of stats(k)) {
    const label = s.label.toUpperCase().slice(0, W - s.value.length - 2);
    const dots = '.'.repeat(Math.max(1, W - label.length - s.value.length - 2));
    line(`${label} ${dots} ${s.value}`.toUpperCase(), { quiet: true });
    k.words.push(`${label} ${s.value}`.toUpperCase());
  }
  line(dashes, { quiet: true });
  const total = 'PRICELESS';
  line(`TOTAL ${'.'.repeat(W - 7 - total.length)} ${total}`, { bold: true, quiet: true, fill: k.inks.accent });
  k.words.push('TOTAL PRICELESS');
  y += lineH * 0.6;
  // A barcode, made up but consistent for the same title.
  let seed = 7;
  for (const c of k.facts.title) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  let bx = x0 + 150;
  const bh = size * 2.6;
  let bars = '';
  while (bx < x0 + w - 150) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const bw = 4 + ((seed >>> 16) % 4) * 4;
    bars += `M${f(bx)} ${f(y)}h${bw}v${f(bh)}h${-bw}Z`;
    bx += bw + 6 + ((seed >>> 8) % 3) * 5;
  }
  svg += `<path d="${bars}" fill="${k.inks.text}"/>`;
  y += bh + lineH * 0.9;
  center(k.facts.statement || 'Thank you, come again');
  y += lineH * 0.2;
  // The paper, with torn zigzag ends.
  const pad = 70;
  const left = x0 - pad;
  const right = x0 + w + pad;
  const bottomY = y + 10;
  const paper = `M${left} ${top}${zigzag(left, right, top, 34, false)}L${right} ${f(bottomY)}${zigzag(right, left, bottomY, 34, true)}Z`;
  svg = `<path d="${paper}" fill="none" stroke="${k.inks.art}" stroke-width="8" stroke-linejoin="round"/>` + svg;
  parts.push({ x: left - 4, y: top - 22, w: right - left + 8, h: bottomY - top + 44 });
  return { svg, bbox: union(...parts) };
}

export const numbers: BackTemplate = {
  id: 'numbers',
  name: 'By the Numbers',
  blurb: 'Years, days, miles, and zero regrets',
  occasions: ['anniversary', 'birthday', 'graduation', 'trip', 'reunion', 'team'],
  uses: ['stats', 'title', 'signature', 'statement', 'dates'],
  variants: [
    { id: 'grid', name: 'Grid' },
    { id: 'sheet', name: 'Stat sheet' },
    { id: 'receipt', name: 'Receipt' },
  ],
  sizes: ['full'],
  build: (k) => (k.back.variant === 'sheet' ? sheet(k) : k.back.variant === 'receipt' ? receipt(k) : grid(k)),
};
