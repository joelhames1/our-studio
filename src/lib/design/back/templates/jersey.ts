// Name & Number: a jersey back. Each shirt gets its own wearer's name.
import { arcText, bottom, draw, text, union, type BackKit, type Composed } from '../kit';
import type { BackTemplate } from './types';

function number(k: BackKit, y: number, fx: 'outline' | 'shadow') {
  const N = text(k, k.facts.bigNumber || '1', { role: 'headline', box: { x: 170, y, w: 1160, h: 1050 }, size: 1100, fill: fx === 'outline' ? k.inks.accent : k.inks.text });
  const svg =
    fx === 'outline'
      ? draw(N, { outline: { width: N.size * 0.07, color: k.inks.text } })
      : draw(N, { shadow: { dx: N.size * 0.035, dy: N.size * 0.035, color: k.inks.shadow } });
  const grow = fx === 'outline' ? N.size * 0.035 : N.size * 0.035;
  return { svg, bbox: { x: N.bbox.x - grow, y: N.bbox.y - grow, w: N.bbox.w + grow * 2, h: N.bbox.h + grow * 2 } };
}

/** Name arched gently over a two-color number. */
function arched(k: BackKit): Composed {
  const A = arcText(k, k.wearer, { role: 'headline', cx: 750, cy: 1900, r: 1640, side: 'top', span: 42, size: 270, upper: true });
  const N = number(k, bottom(A.bbox) + 70, 'outline');
  return { svg: draw(A) + N.svg, bbox: union(A.bbox, N.bbox) };
}

/** Straight nameplate, number with a drop shadow. */
function straight(k: BackKit): Composed {
  const A = text(k, k.wearer, { role: 'headline', box: { x: 200, y: 0, w: 1100, h: 230 }, size: 230, upper: true, tracking: 0.08 });
  const N = number(k, bottom(A.bbox) + 80, 'shadow');
  return { svg: draw(A) + N.svg, bbox: union(A.bbox, N.bbox) };
}

export const jersey: BackTemplate = {
  id: 'jersey',
  name: 'Name & Number',
  blurb: 'A jersey back: everyone gets their own name',
  occasions: ['birthday', 'team', 'reunion', 'anniversary', 'graduation'],
  uses: ['people', 'bigNumber'],
  variants: [
    { id: 'arched', name: 'Arched name' },
    { id: 'straight', name: 'Straight name' },
  ],
  sizes: ['full'],
  personal: true,
  build: (k) => (k.back.variant === 'straight' ? straight(k) : arched(k)),
};
