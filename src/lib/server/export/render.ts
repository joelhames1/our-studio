// High-resolution rendering for print. Same renderer as the browser preview,
// rasterised with resvg, then cleaned up for DTG printers with sharp.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { backDocument, renderBack, type FrontStyle } from '@/lib/design/back/render';
import type { BackDesign, Facts } from '@/lib/design/back/types';
import { renderMockup, type Placement } from '@/lib/design/garments';
import { designDocument, renderDesign } from '@/lib/design/render';
import { CANVAS, type Copy, type FontSet, type GarmentStyle, type ShirtDesign, type Tone } from '@/lib/design/types';

export const DPI = 300;

export interface ShirtFace {
  hex: string;
  tone: Tone;
}

function inInches(doc: string, widthIn?: number): string {
  if (!widthIn) return doc;
  const h = Math.round(widthIn * (CANVAS.h / CANVAS.w) * 100) / 100;
  return doc.replace(`width="${CANVAS.w}" height="${CANVAS.h}"`, `width="${widthIn}in" height="${h}in"`);
}

/** Vector design as a standalone SVG, sized in inches. */
export function designSvg(design: ShirtDesign, copy: Copy, fonts: FontSet, shirt: ShirtFace, assetHref: (k: string) => string, widthIn?: number): string {
  return inInches(designDocument(design, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref }), widthIn);
}

export interface BackJob {
  design: BackDesign;
  facts: Facts;
  front: FrontStyle;
  copy: Copy;
  wearer?: string;
}

const backCtx = (job: BackJob, fonts: FontSet, shirt: ShirtFace) => ({
  fonts,
  copy: job.copy,
  tone: shirt.tone,
  shirtHex: shirt.hex,
  assetHref: () => '',
  facts: job.facts,
  wearer: job.wearer,
});

/** The back as a standalone SVG, sized in inches. */
export function backSvg(job: BackJob, fonts: FontSet, shirt: ShirtFace, widthIn?: number): string {
  return inInches(backDocument(job.design, backCtx(job, fonts, shirt), job.front), widthIn);
}

export function backInner(job: BackJob, fonts: FontSet, shirt: ShirtFace): string {
  return renderBack(job.design, backCtx(job, fonts, shirt), job.front);
}

interface GarmentSpec {
  style: GarmentStyle;
  hex: string;
  tone: Tone;
}

/**
 * resvg will happily read a file path or URL from an image href. Everything we
 * rasterise embeds its images, so anything else is refused outright.
 */
export function assertEmbeddedOnly(svg: string): string {
  for (const m of svg.matchAll(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const v = (m[2] ?? m[3] ?? '').trim();
    if (!v.startsWith('#') && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/i.test(v)) throw new Error('Refusing to render an SVG that links to an outside file.');
  }
  return svg;
}

/** Rasterises a mockup SVG on the order sheet's paper color. */
function mockupToPng(svg: string, w: number, widthPx: number): Buffer {
  assertEmbeddedOnly(svg);
  const bg = svg.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${w}" height="760" fill="#F4EDE1"/>`);
  return Buffer.from(new Resvg(bg, { fitTo: { mode: 'width', value: widthPx }, font: { loadSystemFonts: false } }).render().asPng());
}

function sideMockup(inner: string, g: GarmentSpec, side: 'front' | 'back', printWidthIn: number, placement: Placement, id: string): string {
  return renderMockup({ style: g.style, side, colorHex: g.hex, tone: g.tone, design: inner, printWidthIn, placement, id, view: 'full' });
}

/** Front and back side by side, for the order sheet and for sharing. */
export function renderPairPng(
  frontInner: string,
  backInnerSvg: string,
  g: GarmentSpec,
  front: { printWidthIn: number; placement: Placement },
  back: { printWidthIn: number; placement: Placement },
  widthPx = 2000,
): Buffer {
  const nest = (svg: string, x: number) => svg.replace('<svg xmlns="http://www.w3.org/2000/svg" ', `<svg x="${x}" y="0" width="1000" height="760" `);
  const f = nest(sideMockup(frontInner, g, 'front', front.printWidthIn, front.placement, 'mf'), 0);
  const b = nest(sideMockup(backInnerSvg, g, 'back', back.printWidthIn, back.placement, 'mb'), 1000);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 760">${f}${b}</svg>`;
  return mockupToPng(svg, 2000, widthPx);
}

/** The back on its own shirt picture. */
export function renderBackMockupPng(inner: string, g: GarmentSpec, printWidthIn: number, placement: Placement, widthPx = 1400): Buffer {
  return mockupToPng(sideMockup(inner, g, 'back', printWidthIn, placement, 'mb'), 1000, widthPx);
}

/**
 * Print-ready PNG: transparent background, sRGB, 300 DPI, and no half-transparent
 * pixels (some DTG printers lay white underbase under those and they print as haze).
 */
export async function renderPrintPng(svg: string, widthPx: number, opts: { hardenAlpha?: boolean } = {}): Promise<{ png: Buffer; width: number; height: number }> {
  const resvg = new Resvg(assertEmbeddedOnly(svg), {
    fitTo: { mode: 'width', value: widthPx },
    font: { loadSystemFonts: false },
    shapeRendering: 2,
    imageRendering: 0,
  });
  const out = resvg.render();
  const { width, height } = out;
  const rgba = Buffer.from(out.pixels);
  if (opts.hardenAlpha !== false) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] >= 128 ? 255 : 0;
  }
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .withIccProfile('srgb')
    .withMetadata({ density: DPI })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { png, width, height };
}

/** A shirt mockup picture for the order sheet and for sharing. */
export async function renderMockupPng(
  design: ShirtDesign,
  copy: Copy,
  fonts: FontSet,
  garment: { style: GarmentStyle; hex: string; tone: Tone; printWidthIn: number; placement: Placement },
  assetHref: (k: string) => string,
  widthPx = 1400,
): Promise<Buffer> {
  const inner = renderDesign(design, { fonts, copy, tone: garment.tone, shirtHex: garment.hex, assetHref });
  const svg = renderMockup({
    style: garment.style,
    side: 'front',
    colorHex: garment.hex,
    tone: garment.tone,
    design: inner,
    printWidthIn: garment.printWidthIn,
    placement: garment.placement,
    id: 'mock',
    view: 'full',
  });
  return mockupToPng(svg, 1000, widthPx);
}
