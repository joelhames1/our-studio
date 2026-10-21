// The Crew: everyone who came along, as a roster, a numbered line-up, or a badge.
import { arcText, bottom, capH, draw, ring, star, starRule, text, union, type BackKit, type Composed } from '../kit';
import type { Box } from '../../types';
import type { BackTemplate } from './types';

const people = (k: BackKit) => k.facts.people.filter((p) => p.trim());

function roster(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const C = text(k, 'The Crew', { role: 'label', box: { x: 300, y: 0, w: 900, h: 70 }, size: 64, fill: k.inks.accent });
  svg += draw(C);
  parts.push(C.bbox);
  let y = bottom(C.bbox) + 40;
  const T = text(k, k.facts.title, { role: 'script', box: { x: 120, y, w: 1260, h: 220 }, size: 160, lines: 2, prefer: 1, fill: k.inks.accent });
  svg += draw(T);
  parts.push(T.bbox);
  y = bottom(T.bbox) + 70;
  svg += starRule(750, y, 480, k);
  y += 80;
  const list = people(k);
  const two = list.length > 6;
  const per = Math.min(260, (two ? 2200 : 1100) / Math.max(1, list.length));
  list.forEach((p, i) => {
    const col = two ? i % 2 : 0;
    const row = two ? Math.floor(i / 2) : i;
    const x = two ? 80 + col * 680 : 80;
    const w = two ? 660 : 1340;
    const N = text(k, p, { role: 'headline', box: { x, y: y + row * per, w, h: per * 0.78 }, size: per * 0.78, upper: true });
    svg += draw(N);
    parts.push(N.bbox);
  });
  y += Math.ceil(list.length / (two ? 2 : 1)) * per + 20;
  svg += starRule(750, y, 480, k);
  y += 70;
  const S = text(k, k.facts.dates, { role: 'label', box: { x: 250, y, w: 1000, h: 60 }, size: 52 });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

/** 01 JOEL, 02 ERIN: a team-sheet line-up. */
function numbered(k: BackKit): Composed {
  const parts: Box[] = [];
  let svg = '';
  const T = text(k, k.facts.title, { role: 'headline', box: { x: 80, y: 0, w: 1340, h: 320 }, size: 200, lines: 2, prefer: 1 });
  svg += draw(T);
  parts.push(T.bbox);
  let y = bottom(T.bbox) + 100;
  const list = people(k);
  const per = Math.min(240, 1200 / Math.max(1, list.length));
  list.forEach((p, i) => {
    const num = String(i + 1).padStart(2, '0');
    const Nm = text(k, num, { role: 'monoBold', box: { x: 200, y: y + per * 0.12, w: 220, h: per * 0.5 }, size: per * 0.5, align: 'right', fill: k.inks.accent, quiet: true });
    const N = text(k, p, { role: 'headline', box: { x: 470, y, w: 900, h: per * 0.72 }, size: per * 0.72, align: 'left', upper: true });
    // Sit the number on the name's baseline.
    const dy = bottom(N.bbox) - bottom(Nm.bbox);
    svg += `<g transform="translate(0 ${Math.round(dy * 10) / 10})">${draw(Nm)}</g>` + draw(N);
    parts.push({ ...Nm.bbox, y: Nm.bbox.y + dy }, N.bbox);
    y += per;
  });
  const S = text(k, k.facts.signature, { role: 'label', box: { x: 250, y: y + 40, w: 1000, h: 60 }, size: 50 });
  svg += draw(S);
  parts.push(S.bbox);
  return { svg, bbox: union(...parts) };
}

/** A round badge: title on top, dates below, the names in the middle. */
function badge(k: BackKit): Composed {
  const cx = 750;
  const cy = 700;
  const R = 470;
  let svg = '';
  const top = arcText(k, k.facts.title, { role: 'headline', cx, cy, r: R + 50, side: 'top', span: 150, size: 150, upper: true });
  const bot = arcText(k, k.facts.dates, { role: 'label', cx, cy, r: R + 50, side: 'bottom', span: 120, size: 90, fill: k.inks.accent });
  const band = Math.max(top.size * capH(k, 'headline'), 90);
  const outer = R + 50 + band + 45;
  svg += ring(cx, cy, R + 12, k.inks.art, 12) + ring(cx, cy, outer, k.inks.art, 16);
  svg += draw(top) + draw(bot);
  for (const s of [-1, 1]) svg += star(cx + s * (R + 50 + band / 2), cy, band * 0.32, k.inks.accent);
  const list = people(k);
  const inner = R * 1.25;
  const N = text(k, list.join('\n'), { role: 'headline', box: { x: cx - inner / 2, y: cy - inner / 2, w: inner, h: inner }, size: 260, lines: list.length, valign: 'center', upper: true });
  svg += draw(N);
  return { svg, bbox: union({ x: cx - outer - 8, y: cy - outer - 8, w: 2 * outer + 16, h: 2 * outer + 16 }, N.bbox) };
}

export const crew: BackTemplate = {
  id: 'crew',
  name: 'The Crew',
  blurb: 'Everyone who came along',
  occasions: ['reunion', 'team', 'trip', 'birthday', 'everyday'],
  uses: ['people', 'title', 'dates', 'signature'],
  variants: [
    { id: 'roster', name: 'Roster' },
    { id: 'numbered', name: 'Line-up' },
    { id: 'badge', name: 'Badge' },
  ],
  sizes: ['full', 'neck'],
  build: (k) => (k.back.variant === 'numbered' ? numbered(k) : k.back.variant === 'badge' ? badge(k) : roster(k)),
};
