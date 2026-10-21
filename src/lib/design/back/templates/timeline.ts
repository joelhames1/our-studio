// Timeline: the years that got you here.
import { bottom, dot, draw, ring, rule, text, union, type BackKit, type Composed } from '../kit';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

const moments = (k: BackKit) => k.facts.timeline.filter((m) => m.year.trim() || m.label.trim());

function head(k: BackKit, parts: Box[]): { svg: string; y: number } {
  const H = text(k, k.facts.statement || k.facts.title, { role: 'headline', box: { x: 80, y: 0, w: 1340, h: 420 }, size: 230, lines: 3, prefer: 2 });
  parts.push(H.bbox);
  return { svg: draw(H), y: bottom(H.bbox) + 100 };
}

/** A line down the middle: years on the left, what happened on the right. */
function vertical(k: BackKit): Composed {
  const parts: Box[] = [];
  let { svg, y } = head(k, parts);
  const list = moments(k);
  const per = Math.min(300, 1100 / Math.max(1, list.length));
  const cx = 640;
  const top = y;
  list.forEach((m, i) => {
    const cy = top + i * per + per * 0.3;
    const Y = text(k, m.year, { role: 'headline', box: { x: 80, y: cy - per * 0.22, w: cx - 160, h: per * 0.44 }, size: per * 0.42, align: 'right', valign: 'center', fill: k.inks.accent });
    const L = text(k, m.label, { role: 'list', box: { x: cx + 70, y: cy - per * 0.3, w: 1420 - cx - 70, h: per * 0.6 }, size: per * 0.2, lines: 2, align: 'left', valign: 'center' });
    svg += draw(Y) + draw(L) + dot(cx, cy, per * 0.07, k.inks.accent) + ring(cx, cy, per * 0.11, k.inks.accent, 5);
    parts.push(Y.bbox, L.bbox);
  });
  if (list.length > 1) {
    const a = top + per * 0.3;
    const b = top + (list.length - 1) * per + per * 0.3;
    svg = rule(cx, a, cx, b, k.inks.art, 8) + svg;
  }
  y = top + list.length * per + 20;
  const S = text(k, k.facts.signature, { role: 'script', box: { x: 200, y, w: 1100, h: 150 }, size: 110, fill: k.inks.accent });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

/** Left to right: years over the line, what happened under it. */
function horizontal(k: BackKit): Composed {
  const parts: Box[] = [];
  let { svg, y } = head(k, parts);
  const list = moments(k);
  const n = Math.max(1, list.length);
  const span = 1240;
  const step = n > 1 ? span / (n - 1) : 0;
  const x0 = n > 1 ? 130 : 750;
  const colW = Math.min(520, n > 1 ? step * 0.98 : 900);
  const lineY = y + 190;
  svg += rule(80, lineY, 1420, lineY, k.inks.art, 8);
  list.forEach((m, i) => {
    const x = x0 + i * step;
    const half = colW / 2;
    const left = Math.max(40, Math.min(1460 - colW, x - half));
    const Y = text(k, m.year, { role: 'headline', box: { x: left, y: lineY - 175, w: colW, h: 135 }, size: 140, valign: 'bottom', fill: k.inks.accent });
    const L = text(k, m.label, { role: 'list', box: { x: left, y: lineY + 60, w: colW, h: 220 }, size: 66, lines: 3 });
    svg += draw(Y) + draw(L) + dot(x, lineY, 26, k.inks.accent) + ring(x, lineY, 40, k.inks.accent, 5);
    parts.push(Y.bbox, L.bbox);
  });
  parts.push({ x: 80, y: lineY - 45, w: 1340, h: 90 });
  y = Math.max(...parts.map(bottom)) + 90;
  const S = text(k, k.facts.signature, { role: 'script', box: { x: 200, y, w: 1100, h: 150 }, size: 110, fill: k.inks.accent });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

export const timeline: BackTemplate = {
  id: 'timeline',
  name: 'Timeline',
  blurb: 'The years that got you here',
  occasions: ['anniversary', 'birthday', 'graduation', 'reunion'],
  uses: ['statement', 'timeline', 'signature'],
  variants: [
    { id: 'vertical', name: 'Top to bottom' },
    { id: 'horizontal', name: 'Side to side' },
  ],
  sizes: ['full'],
  build: (k) => (k.back.variant === 'horizontal' ? horizontal(k) : vertical(k)),
};
