// The route, three ways: a departures line down the back, a winding path like a
// board game, and a split-flap arrivals board.
import { legsOf } from '../facts';
import { bottom, clamp, dot, draw, f, plane, readable, rect, ring, rule, text, union, type BackKit, type Composed } from '../kit';
import { contrast } from '../../palettes';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

function header(k: BackKit, y: number, parts: Box[]): { svg: string; y: number } {
  let svg = '';
  const T = text(k, k.facts.title, { role: 'headline', box: { x: 80, y, w: 1340, h: 300 }, size: 210, lines: 2, prefer: 1 });
  svg += draw(T);
  parts.push(T.bbox);
  y = T.size ? bottom(T.bbox) + 40 : y;
  const D = text(k, k.facts.dates, { role: 'label', box: { x: 230, y, w: 1040, h: 60 }, size: 54, fill: k.inks.accent });
  svg += draw(D);
  parts.push(D.bbox);
  return { svg, y: D.size ? bottom(D.bbox) + 80 : y + 30 };
}

function signature(k: BackKit, y: number, parts: Box[]): string {
  const S = text(k, k.facts.signature, { role: 'script', box: { x: 200, y, w: 1100, h: 150 }, size: 110, fill: k.inks.accent });
  parts.push(S.bbox);
  return draw(S);
}

/** A dotted line down the back with a dot at each airport. */
function line(k: BackKit): Composed {
  const stops = k.facts.stops;
  const parts: Box[] = [];
  let { svg, y } = header(k, 0, parts);
  const n = stops.length;
  if (!n) return { svg, bbox: union(...parts) };
  const rowH = clamp(1300 / n, 120, 210);
  const codeSize = rowH * 0.7;
  const lineX = 140;
  const top = y + 60;
  const cy = (i: number) => top + rowH * i + rowH / 2;
  // A plane taking off at the top, then a dotted line through every airport.
  svg += plane(lineX, top - 30, 96, 180, k.inks.art);
  svg += rule(lineX, top + 30, lineX, cy(n - 1), k.inks.art, 8, '2 18');
  stops.forEach((s, i) => {
    const c = cy(i);
    svg += s.stay ? dot(lineX, c, rowH * 0.16, k.inks.accent) + ring(lineX, c, rowH * 0.25, k.inks.accent, 5) : dot(lineX, c, rowH * 0.1, k.inks.art);
    const code = text(k, s.code || s.place.slice(0, 3), {
      role: 'headline',
      box: { x: 250, y: c - codeSize / 2, w: 360, h: codeSize },
      size: codeSize,
      align: 'left',
      valign: 'center',
      upper: true,
      fill: s.stay ? k.inks.text : k.inks.accent2,
    });
    const where = [s.place, s.region].filter(Boolean).join(', ');
    const P = text(k, where, { role: 'list', box: { x: 600, y: c - rowH * 0.36, w: 820, h: rowH * 0.34 }, size: rowH * 0.34, align: 'left', valign: 'bottom' });
    const D = text(k, s.date, { role: 'list', box: { x: 600, y: c + rowH * 0.08, w: 820, h: rowH * 0.28 }, size: rowH * 0.26, align: 'left', fill: k.inks.accent });
    svg += draw(code) + draw(P) + draw(D);
    parts.push(code.bbox, P.bbox, D.bbox);
  });
  parts.push({ x: lineX - rowH * 0.27, y: top - 80, w: rowH * 0.54, h: cy(n - 1) - top + 80 + rowH * 0.27 });
  svg += signature(k, cy(n - 1) + rowH / 2 + 50, parts);
  return { svg, bbox: union(...parts) };
}

/** The route snakes across the back, left to right then back again. */
function winding(k: BackKit): Composed {
  const stops = k.facts.stops;
  const parts: Box[] = [];
  let { svg, y } = header(k, 0, parts);
  const n = stops.length;
  if (!n) return { svg, bbox: union(...parts) };
  const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const colW = 1240 / cols;
  const rowGap = 360;
  const top = y + 40;
  const pos = stops.map((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cc = r % 2 ? cols - 1 - c : c;
    return { x: 130 + colW / 2 + cc * colW, y: top + r * rowGap, r };
  });
  let d = `M${f(pos[0].x)} ${f(pos[0].y)}`;
  for (let i = 1; i < n; i++) {
    const p = pos[i];
    const q = pos[i - 1];
    if (p.r === q.r) d += `L${f(p.x)} ${f(p.y)}`;
    else {
      // Turn the corner with a half circle on the outside.
      const rad = rowGap / 2;
      const right = q.r % 2 === 0;
      const ex = q.x + (right ? 1 : -1) * (colW * 0.32);
      d += `L${f(ex)} ${f(q.y)}A${f(rad)} ${f(rad)} 0 0 ${right ? 1 : 0} ${f(ex)} ${f(p.y)}L${f(p.x)} ${f(p.y)}`;
    }
  }
  svg += `<path d="${d}" fill="none" stroke="${k.inks.accent2}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 24"/>`;
  // A plane flying the first leg.
  if (n > 1) {
    const a = pos[0];
    const b = pos[1];
    const heading = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
    svg += plane((a.x + b.x) / 2, (a.y + b.y) / 2, 92, heading, k.inks.art);
  }
  stops.forEach((s, i) => {
    const p = pos[i];
    svg += s.stay ? dot(p.x, p.y, 26, k.inks.accent) + ring(p.x, p.y, 38, k.inks.accent, 5) : dot(p.x, p.y, 14, k.inks.art);
    const code = text(k, s.code || s.place.slice(0, 3), {
      role: 'headline',
      box: { x: p.x - colW / 2 + 14, y: p.y + 62, w: colW - 28, h: 120 },
      size: 120,
      upper: true,
      fill: s.stay ? k.inks.text : k.inks.accent2,
    });
    const D = text(k, s.date, { role: 'list', box: { x: p.x - colW / 2 + 14, y: bottom(code.bbox) + 22, w: colW - 28, h: 44 }, size: 40 });
    svg += draw(code) + draw(D);
    parts.push(code.bbox, D.bbox, { x: p.x - 40, y: p.y - 40, w: 80, h: 80 });
  });
  // The turns poke out past the dots.
  if (rows > 1) parts.push({ x: 130 + colW * 0.18 - rowGap / 2, y: top, w: 1240 - colW * 0.36 + rowGap, h: 1 });
  const last = Math.max(...parts.map(bottom));
  svg += signature(k, last + 70, parts);
  return { svg, bbox: union(...parts) };
}

/** A split-flap arrivals board: one row per flight. */
function board(k: BackKit): Composed {
  const legs = legsOf(k.facts);
  const parts: Box[] = [];
  let { svg, y } = header(k, 0, parts);
  if (!legs.length) return { svg, bbox: union(...parts) };
  const shirt = k.ctx.shirtHex;
  const light = k.ctx.tone === 'light';
  const tileFill = light ? k.inks.text : contrast(k.inks.panel, shirt) >= 1.3 ? k.inks.panel : k.inks.text;
  const charFill = readable(tileFill, [k.inks.sun[0], k.inks.accent, k.inks.panel, shirt], 3);

  const dateW = Math.min(6, Math.max(...legs.map((l) => l.to.date.length), 4));
  const roundTrip = legs.length > 1 && legs[0].from.code === legs[legs.length - 1].to.code;
  const status = (i: number) => (roundTrip && i === legs.length - 1 ? 'HOME' : 'LANDED');
  const cols = [dateW, 3, 3, 6];
  const totalTiles = cols.reduce((a, b) => a + b, 0) + cols.length - 1;
  const pitch = 1300 / totalTiles;
  const tw = pitch * 0.9;
  const th = tw * 1.38;
  const rowPitch = th + pitch * 0.42;
  const x0 = 100;
  const frame = { x: x0 - 50, y, w: 1400, h: 0 };

  // Board header: plane, ARRIVALS, and the dates.
  svg += plane(x0 + 40, y + 78, 82, 90, k.inks.text);
  const A = text(k, 'Arrivals', { role: 'monoBold', box: { x: x0 + 110, y: y + 40, w: 600, h: 80 }, size: 76, align: 'left', valign: 'center' });
  svg += draw(A);
  y += 160;
  const labels = ['Date', 'From', 'To', 'Status'];
  let cx = x0;
  labels.forEach((l, i) => {
    const L = text(k, l, { role: 'mono', box: { x: cx, y, w: cols[i] * pitch, h: 40 }, size: 32, align: 'left', fill: k.inks.accent, quiet: true });
    svg += draw(L);
    cx += (cols[i] + 1) * pitch;
  });
  y += 60;

  const tile = (ch: string, x: number, ty: number) => {
    const gap = Math.max(3, th * 0.035);
    let s = rect({ x, y: ty, w: tw, h: th / 2 - gap / 2 }, { fill: tileFill, rx: tw * 0.12 });
    s += rect({ x, y: ty + th / 2 + gap / 2, w: tw, h: th / 2 - gap / 2 }, { fill: tileFill, rx: tw * 0.12 });
    if (ch.trim()) {
      const g = text(k, ch, { role: 'monoBold', box: { x, y: ty, w: tw, h: th }, size: th * 0.8, exact: true, valign: 'center', fill: charFill, quiet: true });
      s += draw(g);
    }
    return s;
  };

  legs.forEach((leg, i) => {
    const cells = [leg.to.date.toUpperCase().padEnd(dateW).slice(0, dateW), leg.from.code.padEnd(3).slice(0, 3), leg.to.code.padEnd(3).slice(0, 3), status(i).padEnd(6)];
    k.words.push(cells.map((c) => c.trim()).join(' '));
    let x = x0;
    cells.forEach((cell, ci) => {
      for (const ch of cell) {
        svg += tile(ch, x, y);
        x += pitch;
      }
      x += pitch;
    });
    y += rowPitch;
  });
  frame.h = y - frame.y + 30;
  svg += rect(frame, { stroke: k.inks.text, width: 10, rx: 40 });
  parts.push({ x: frame.x - 5, y: frame.y - 5, w: frame.w + 10, h: frame.h + 10 });
  svg += signature(k, frame.y + frame.h + 70, parts);
  return { svg, bbox: union(...parts) };
}

export const flightPath: BackTemplate = {
  id: 'flight-path',
  name: 'Flight Path',
  blurb: 'Every airport, in order',
  occasions: ['trip'],
  uses: ['title', 'dates', 'stops', 'signature'],
  variants: [
    { id: 'line', name: 'Departures line' },
    { id: 'winding', name: 'Winding route' },
    { id: 'board', name: 'Arrivals board' },
  ],
  sizes: ['full'],
  build: (k) => (k.back.variant === 'winding' ? winding(k) : k.back.variant === 'board' ? board(k) : line(k)),
};
