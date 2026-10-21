// Big Statement: one line, said loudly. Works for anything.
import { bottom, draw, peopleLine, starRule, text, union, type BackKit, type Composed } from '../kit';
import type { BackTemplate } from './types';

function stacked(k: BackKit): Composed {
  const S = text(k, k.facts.statement, { role: 'headline', box: { x: 60, y: 0, w: 1380, h: 900 }, size: 380, lines: 4, prefer: 2, upper: true });
  let y = bottom(S.bbox) + 90;
  const rule = starRule(750, y, 440, k);
  y += 80;
  const G = text(k, k.facts.signature, { role: 'label', box: { x: 200, y, w: 1100, h: 70 }, size: 60, fill: k.inks.accent });
  return { svg: draw(S) + rule + draw(G), bbox: union(S.bbox, G.bbox, { x: 310, y: y - 100, w: 880, h: 40 }) };
}

function script(k: BackKit): Composed {
  const S = text(k, k.facts.statement, { role: 'script', box: { x: 80, y: 0, w: 1340, h: 700 }, size: 300, lines: 3, prefer: 2, fill: k.inks.accent });
  const P = text(k, peopleLine(k.facts.people), { role: 'label', box: { x: 250, y: bottom(S.bbox) + 90, w: 1000, h: 80 }, size: 70 });
  return { svg: draw(S) + draw(P), bbox: union(S.bbox, P.bbox) };
}

export const statement: BackTemplate = {
  id: 'statement',
  name: 'Big Statement',
  blurb: 'One line, said loudly',
  occasions: ['trip', 'anniversary', 'birthday', 'graduation', 'reunion', 'team', 'everyday'],
  uses: ['statement', 'signature', 'people'],
  variants: [
    { id: 'stacked', name: 'Stacked' },
    { id: 'script', name: 'Script' },
  ],
  sizes: ['full', 'neck'],
  build: (k) => (k.back.variant === 'script' ? script(k) : stacked(k)),
};
