// The band-tee back: who's on tour, the tour name, and every stop with its date.
import { staysOf } from '../facts';
import { arcText, bottom, clamp, draw, measure, peopleLine, starRule, text, union, type BackKit, type Composed } from '../kit';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

function rowsOf(k: BackKit) {
  const stays = staysOf(k.facts);
  return (stays.length ? stays : k.facts.stops).map((s) => ({ date: s.date, place: [s.place, s.region].filter(Boolean).join(', ') }));
}

/** Big names, tour title, then a two-column list. */
function classic(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const P = text(k, peopleLine(k.facts.people), { role: 'headline', box: { x: 60, y: 0, w: 1380, h: 280 }, size: 260, upper: true });
  svg += draw(P);
  parts.push(P.bbox);
  let y = bottom(P.bbox) + 30;
  const T = text(k, k.facts.title, { role: 'script', box: { x: 120, y, w: 1260, h: 220 }, size: 170, lines: 2, prefer: 1, fill: k.inks.accent });
  svg += draw(T);
  parts.push(T.bbox);
  y = bottom(T.bbox) + 70;
  svg += starRule(750, y, 520, k);
  y += 80;

  const rows = rowsOf(k);
  if (rows.length) {
    const gap = 60;
    const dw = Math.max(...rows.map((r) => measure(k, r.date, { role: 'list' })));
    const pw = Math.max(...rows.map((r) => measure(k, r.place, { role: 'list' })));
    const size = Math.min(clamp(900 / rows.length, 40, 66), (1280 - gap) / Math.max(0.01, dw + pw));
    const rowH = size * 1.75;
    const total = dw * size + gap + pw * size;
    const x0 = 750 - total / 2;
    rows.forEach((r, i) => {
      const ry = y + i * rowH;
      const D = text(k, r.date, { role: 'list', box: { x: x0, y: ry, w: dw * size, h: size }, size, exact: true, align: 'right', fill: k.inks.accent });
      const L = text(k, r.place, { role: 'list', box: { x: x0 + dw * size + gap, y: ry, w: pw * size, h: size }, size, exact: true, align: 'left' });
      svg += draw(D) + draw(L);
      parts.push(D.bbox, L.bbox);
    });
    y += rows.length * rowH + 20;
  }
  svg += starRule(750, y, 520, k);
  y += 70;
  const S = text(k, k.facts.dates, { role: 'label', box: { x: 250, y, w: 1000, h: 60 }, size: 52 });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

/** Names arched over the top, each stop stacked: date above the place. */
function arched(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const A = arcText(k, peopleLine(k.facts.people), { role: 'headline', cx: 750, cy: 1500, r: 1300, side: 'top', span: 52, size: 230, upper: true });
  svg += draw(A);
  parts.push(A.bbox);
  let y = bottom(A.bbox) + 30;
  const T = text(k, k.facts.title, { role: 'script', box: { x: 160, y, w: 1180, h: 200 }, size: 150, lines: 2, prefer: 1, fill: k.inks.accent });
  svg += draw(T);
  parts.push(T.bbox);
  y = bottom(T.bbox) + 80;
  const rows = rowsOf(k);
  const per = clamp(1250 / Math.max(1, rows.length), 120, 220);
  rows.forEach((r) => {
    const D = text(k, r.date, { role: 'list', box: { x: 300, y, w: 900, h: per * 0.26 }, size: per * 0.24, fill: k.inks.accent });
    const L = text(k, r.place, { role: 'headline', box: { x: 100, y: bottom(D.bbox) + per * 0.07, w: 1300, h: per * 0.52 }, size: per * 0.52, upper: true });
    svg += draw(D) + draw(L);
    parts.push(D.bbox, L.bbox);
    y = bottom(L.bbox) + per * 0.24;
  });
  const S = text(k, k.facts.dates, { role: 'label', box: { x: 250, y: y + 20, w: 1000, h: 60 }, size: 50 });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

export const tourDates: BackTemplate = {
  id: 'tour-dates',
  name: 'Tour Dates',
  blurb: 'Like a band tee: every stop and its date',
  occasions: ['trip', 'reunion', 'birthday', 'anniversary'],
  uses: ['people', 'title', 'stops', 'dates'],
  variants: [
    { id: 'classic', name: 'Two columns' },
    { id: 'arched', name: 'Arched names' },
  ],
  sizes: ['full'],
  build: (k) => (k.back.variant === 'arched' ? arched(k) : classic(k)),
};
