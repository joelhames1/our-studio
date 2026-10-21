// Coordinates: the exact spot on the planet, for the place that matters.
import { formatCoords } from '../facts';
import { bottom, dot, draw, f, rule, text, union, type BackKit, type Composed } from '../kit';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

const coords = (k: BackKit) => formatCoords(k.facts.place.lat, k.facts.place.lng);

function details(k: BackKit, y: number, parts: Box[]): string {
  let svg = '';
  const c = coords(k);
  if (c) {
    const C = text(k, c, { role: 'monoBold', box: { x: 300, y, w: 900, h: 90 }, size: 80, fill: k.inks.accent });
    const mid = C.bbox.y + C.bbox.h / 2;
    svg += draw(C) + rule(120, mid, C.bbox.x - 50, mid, k.inks.art, 6) + rule(C.bbox.x + C.bbox.w + 50, mid, 1380, mid, k.inks.art, 6);
    parts.push(C.bbox, { x: 120, y: mid, w: 1260, h: 1 });
    y = bottom(C.bbox) + 60;
  }
  const D = text(k, k.facts.dates, { role: 'label', box: { x: 250, y, w: 1000, h: 60 }, size: 54 });
  svg += draw(D);
  parts.push(D.bbox);
  return svg;
}

function stacked(k: BackKit): Composed {
  const parts: Box[] = [];
  const N = text(k, k.facts.place.name || k.facts.title, { role: 'headline', box: { x: 80, y: 0, w: 1340, h: 520 }, size: 300, lines: 2, prefer: 2, upper: true });
  parts.push(N.bbox);
  const svg = draw(N) + details(k, bottom(N.bbox) + 80, parts);
  return { svg, bbox: union(...parts) };
}

function rose(cx: number, cy: number, R: number, k: BackKit): string {
  let svg = '';
  const point = (deg: number, len: number, w: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
    const side = (s: number) => [cx + Math.cos(a + (s * Math.PI) / 2) * w, cy + Math.sin(a + (s * Math.PI) / 2) * w];
    const [l, r] = [side(-1), side(1)];
    return (
      `<path d="M${f(cx)} ${f(cy)}L${f(l[0])} ${f(l[1])}L${f(tip[0])} ${f(tip[1])}Z" fill="${k.inks.accent}"/>` +
      `<path d="M${f(cx)} ${f(cy)}L${f(r[0])} ${f(r[1])}L${f(tip[0])} ${f(tip[1])}Z" fill="${k.inks.text}"/>`
    );
  };
  for (const d of [45, 135, 225, 315]) svg += point(d, R * 0.58, R * 0.1);
  for (const d of [0, 90, 180, 270]) svg += point(d, R, R * 0.15);
  svg += dot(cx, cy, R * 0.05, k.inks.text);
  svg += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.78)}" fill="none" stroke="${k.inks.art}" stroke-width="6" stroke-dasharray="3 18" stroke-linecap="round"/>`;
  return svg;
}

function compass(k: BackKit): Composed {
  const parts: Box[] = [];
  const R = 300;
  const cy = 120 + R;
  let svg = rose(750, cy, R, k);
  const Nn = text(k, 'N', { role: 'headline', box: { x: 690, y: 0, w: 120, h: 90 }, size: 90, quiet: true });
  svg += draw(Nn);
  parts.push(Nn.bbox, { x: 750 - R, y: cy - R, w: 2 * R, h: 2 * R });
  const N = text(k, k.facts.place.name || k.facts.title, { role: 'headline', box: { x: 80, y: cy + R + 80, w: 1340, h: 340 }, size: 230, lines: 2, prefer: 1, upper: true });
  parts.push(N.bbox);
  svg += draw(N) + details(k, bottom(N.bbox) + 70, parts);
  return { svg, bbox: union(...parts) };
}

export const coordinates: BackTemplate = {
  id: 'coordinates',
  name: 'Coordinates',
  blurb: 'The exact spot: where you went, met, or live',
  occasions: ['trip', 'anniversary', 'everyday', 'reunion'],
  uses: ['place', 'dates'],
  variants: [
    { id: 'stacked', name: 'Stacked' },
    { id: 'compass', name: 'Compass' },
  ],
  sizes: ['full', 'neck'],
  build: (k) => (k.back.variant === 'compass' ? compass(k) : stacked(k)),
};
