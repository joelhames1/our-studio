// Flat garment mockups. Garments are drawn in a 1000 x 760 box at roughly
// 20 units per inch (an adult Large), so print sizes on the mockup are honest.
import type { GarmentSide, GarmentStyle, Tone } from './types';
import { CANVAS } from './types';

export const UNITS_PER_INCH = 20;

export const GARMENT_STYLES: { id: GarmentStyle; name: string; blurb: string }[] = [
  { id: 'tee', name: 'T-shirt', blurb: 'Classic crew neck' },
  { id: 'longsleeve', name: 'Long sleeve', blurb: 'For plane cabins' },
  { id: 'hoodie', name: 'Hoodie', blurb: 'Cozy, with a pocket' },
];

/** Where a print sits. `neck` is the small print under the back collar. */
export type Placement = 'center' | 'left-chest' | 'neck';

export interface PrintPreset {
  id: string;
  name: string;
  widthIn: number;
  placement: Placement;
  note: string;
}

export const PRINT_PRESETS: PrintPreset[] = [
  { id: 'standard', name: 'Standard front', widthIn: 12, placement: 'center', note: 'What most shops print on adult tees' },
  { id: 'large', name: 'Large front', widthIn: 15, placement: 'center', note: 'Big and bold, if the shop can do it' },
  { id: 'medium', name: 'Medium front', widthIn: 10, placement: 'center', note: 'Understated; best for hoodies (clears the pocket)' },
  { id: 'chest', name: 'Left chest', widthIn: 4, placement: 'left-chest', note: 'Small, like a logo' },
];

export function printPreset(id: string): PrintPreset {
  return PRINT_PRESETS.find((p) => p.id === id) ?? PRINT_PRESETS[0];
}

/** Print size in inches; height follows the 5:6 canvas. */
export function printSizeIn(preset: PrintPreset): { w: number; h: number } {
  return { w: preset.widthIn, h: Math.round(preset.widthIn * (CANVAS.h / CANVAS.w) * 10) / 10 };
}

// --- color helpers -------------------------------------------------------------

function mix(hex: string, target: string, amt: number): string {
  const p = (h: string) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(target);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const darker = (hex: string, amt: number) => mix(hex, '#000000', amt);
const lighter = (hex: string, amt: number) => mix(hex, '#ffffff', amt);

// --- shapes ------------------------------------------------------------------------

interface GarmentShape {
  body: string;
  /** Hood fabric, drawn before the lining. */
  hood?: string;
  /** Extra filled detail drawn in a darker shade (inside of neck, hood lining). */
  inner?: string;
  /** Darker bands (cuffs, hem rib, pocket). */
  bands?: string;
  /** Seam and fold lines. */
  seams: string;
  /** Things drawn on top of the print (drawstrings). */
  overlay?: string;
  /** Top of the print area, and its center x. */
  printTop: number;
  /** Top of a small neck print (backs only). */
  neckTop: number;
  crop: { x: number; y: number; w: number; h: number };
}

const FRONT_NECK = 'C575 165 425 165 420 80';
const BACK_NECK = 'C560 100 440 100 420 80';

function teeBody(back: boolean): string {
  return (
    'M420 80C380 90 342 99 305 108L175 265L275 330L290 268C287 420 289 560 292 680Q500 694 708 680' +
    'C711 560 713 420 710 268L725 330L825 265L695 108C658 99 620 90 580 80' +
    (back ? BACK_NECK : FRONT_NECK) +
    'Z'
  );
}

function longBody(back: boolean): string {
  return (
    'M420 80C380 90 342 99 305 108C252 228 224 420 212 636L216 668L284 671L284 636C284 470 286 360 290 268' +
    'C287 420 289 560 292 680Q500 694 708 680C711 560 713 420 710 268C714 360 716 470 716 636L716 671L784 668L788 636' +
    'C776 420 748 228 695 108C658 99 620 90 580 80' +
    (back ? BACK_NECK : FRONT_NECK) +
    'Z'
  );
}

function hoodieBody(): string {
  return (
    'M410 96C372 104 336 113 298 124C246 246 218 430 204 640L207 684L279 688L281 640C281 480 283 370 286 282' +
    'L288 748L712 748L714 282C717 370 719 480 719 640L721 688L793 684L796 640C782 430 754 246 702 124' +
    'C664 113 628 104 590 96Z'
  );
}

const HOODIE_BANDS = 'M288 712L712 712L712 748L288 748Z M204 640L281 640L279 688L207 684Z M719 640L796 640L793 684L721 688Z';

function shapeFor(style: GarmentStyle, side: GarmentSide): GarmentShape {
  if (style === 'hoodie') {
    if (side === 'front') {
      return {
        body: hoodieBody(),
        hood: 'M372 150C350 62 420 14 500 14C580 14 650 62 628 150C600 178 560 196 500 214C440 196 400 178 372 150Z',
        inner: 'M398 128C420 96 460 84 500 84C540 84 580 96 602 128C570 178 540 204 500 214C460 204 430 178 398 128Z',
        bands: HOODIE_BANDS + ' M345 470L655 470L700 640L300 640Z',
        seams:
          'M372 150C350 62 420 14 500 14C580 14 650 62 628 150M398 128C430 186 470 210 500 214C530 210 570 186 602 128' +
          'M345 470L300 640M655 470L700 640M345 470L655 470',
        overlay:
          '<path d="M474 204L468 326M526 204L532 326" stroke="#f4f1ea" stroke-width="6" stroke-linecap="round" fill="none"/>' +
          '<path d="M462 322L474 322L473 348L463 348ZM526 322L538 322L537 348L527 348Z" fill="#cfc8bb"/>',
        printTop: 226,
        neckTop: 226,
        crop: { x: 245, y: 10, w: 510, h: 561 },
      };
    }
    return {
      body: hoodieBody(),
      hood: 'M385 112C335 162 335 330 420 390Q500 420 580 390C665 330 665 162 615 112C585 64 540 48 500 48C460 48 415 64 385 112Z',
      bands: HOODIE_BANDS,
      seams: 'M500 48L500 412M385 112C335 162 335 330 420 390Q500 420 580 390C665 330 665 162 615 112',
      printTop: 440,
      // Just below where the hood lies.
      neckTop: 428,
      crop: { x: 245, y: 140, w: 510, h: 561 },
    };
  }
  const body = style === 'tee' ? teeBody(side === 'back') : longBody(side === 'back');
  const seams =
    `M580 80${side === 'front' ? FRONT_NECK : BACK_NECK}` +
    (style === 'tee' ? 'M190 258L282 318M810 258L718 318' : 'M212 636L284 636M716 636L788 636') +
    'M296 666Q500 680 704 666';
  return {
    body,
    inner: side === 'front' ? `M420 80C440 100 560 100 580 80${FRONT_NECK}Z` : undefined,
    bands: style === 'longsleeve' ? 'M212 636L284 636L284 671L216 668Z M716 636L788 636L784 668L716 671Z' : undefined,
    seams,
    printTop: side === 'front' ? 195 : 140,
    neckTop: 116,
    crop: { x: 255, y: 70, w: 490, h: 539 },
  };
}

// --- mockup -------------------------------------------------------------------------

export interface MockupOptions {
  style: GarmentStyle;
  side: GarmentSide;
  colorHex: string;
  tone: Tone;
  /** Inner design markup for the 1500 x 1800 canvas, or '' for a blank side. */
  design: string;
  printWidthIn: number;
  placement?: Placement;
  /** Unique per instance; used for gradient ids. */
  id: string;
  view?: 'full' | 'chest';
  /** Zoom to this part of the garment instead (garment units). */
  crop?: { x: number; y: number; w: number; h: number };
}

export function printRect(o: Pick<MockupOptions, 'style' | 'side' | 'printWidthIn' | 'placement'>) {
  const shape = shapeFor(o.style, o.side);
  const w = o.printWidthIn * UNITS_PER_INCH;
  const h = w * (CANVAS.h / CANVAS.w);
  const cx = o.placement === 'left-chest' && o.side === 'front' ? 500 + 4.2 * UNITS_PER_INCH : 500;
  const top =
    o.placement === 'left-chest' && o.side === 'front' ? shape.printTop + 10 : o.placement === 'neck' && o.side === 'back' ? shape.neckTop : shape.printTop;
  return { x: cx - w / 2, y: top, w, h };
}

export function renderMockup(o: MockupOptions): string {
  const shape = shapeFor(o.style, o.side);
  const base = o.colorHex;
  const dark = o.tone === 'dark';
  const shadeA = darker(base, dark ? 0.35 : 0.14);
  const inner = darker(base, dark ? 0.45 : 0.22);
  const band = darker(base, dark ? 0.18 : 0.06);
  const seam = dark ? lighter(base, 0.12) : darker(base, 0.2);
  const id = o.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const r = printRect(o);
  const vb = o.crop ?? (o.view === 'chest' ? shape.crop : { x: 0, y: 0, w: 1000, h: 760 });

  const designSvg = o.design
    ? `<svg x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" overflow="hidden">${o.design}</svg>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" role="img">`,
    '<defs>',
    `<linearGradient id="${id}-side" x1="0" x2="1" y1="0" y2="0">`,
    `<stop offset="0" stop-color="#000" stop-opacity="${dark ? 0.28 : 0.14}"/>`,
    '<stop offset="0.2" stop-color="#000" stop-opacity="0"/>',
    '<stop offset="0.8" stop-color="#000" stop-opacity="0"/>',
    `<stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.28 : 0.14}"/>`,
    '</linearGradient>',
    `<radialGradient id="${id}-glow" cx="0.5" cy="0.35" r="0.6">`,
    `<stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.1 : 0.18}"/>`,
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    `<path d="${shape.body}" fill="${base}"/>`,
    shape.hood ? `<path d="${shape.hood}" fill="${band}"/>` : '',
    shape.inner ? `<path d="${shape.inner}" fill="${inner}"/>` : '',
    shape.bands ? `<path d="${shape.bands}" fill="${band}"/>` : '',
    designSvg,
    // Shading on top of the print so the ink looks like it's on fabric.
    `<path d="${shape.body}" fill="url(#${id}-side)"/>`,
    `<path d="${shape.body}" fill="url(#${id}-glow)"/>`,
    `<path d="M302 300C336 350 344 400 338 450M698 300C664 350 656 400 662 450" stroke="${shadeA}" stroke-opacity="0.5" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    `<path d="${shape.seams}" stroke="${seam}" stroke-opacity="0.75" stroke-width="4" fill="none" stroke-dasharray="${o.style === 'hoodie' ? '0' : '10 7'}"/>`,
    shape.overlay ?? '',
    '</svg>',
  ].join('');
}
