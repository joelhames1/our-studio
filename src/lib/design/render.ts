import { wordInks } from './colors';
import { LAYOUTS } from './layouts';
import { inksFor } from './palettes';
import { pairing as getPairing } from './pairings';
import { safeCopy, safeDesign } from './safe';
import { CANVAS, type Box, type RenderContext, type ShirtDesign } from './types';

const MARGIN = 40;

/** The words a design will actually print. */
export function copyFor(design: ShirtDesign, ctx: Pick<RenderContext, 'copy'>) {
  return (design.copyOverride != null && safeCopy(design.copyOverride)) || ctx.copy;
}

/**
 * Renders a design as SVG markup for the 1500 x 1800 canvas (no outer <svg>).
 * Used by both the browser preview and the print export, so they always match.
 */
export function renderDesign(stored: ShirtDesign, ctx: RenderContext): string {
  // Older or odd records still render rather than taking the page down.
  const design = safeDesign(stored);
  const pairing = getPairing(design.pairing);
  const inks = inksFor(design.palette, { hex: ctx.shirtHex, tone: ctx.tone });
  const layout = LAYOUTS[design.layout];
  const composed = layout.build({
    design,
    ctx,
    inks,
    pairing,
    emphasis: design.emphasis ?? pairing.defaultEmphasis,
    copy: copyFor(design, ctx),
    fonts: ctx.fonts,
    words: wordInks(inks, design.colors),
  });
  return fitToCanvas(composed);
}

/**
 * Fits composed artwork inside the canvas, centered horizontally and sitting at
 * the top like a real print.
 */
export function fitToCanvas(composed: { svg: string; bbox: Box }): string {
  const b = composed.bbox;
  if (b.w <= 0 || b.h <= 0) return '';
  const s = Math.min(1, (CANVAS.w - 2 * MARGIN) / b.w, (CANVAS.h - 2 * MARGIN) / b.h);
  const tx = (CANVAS.w - b.w * s) / 2 - b.x * s;
  const ty = MARGIN - b.y * s;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `<g transform="translate(${r(tx)} ${r(ty)}) scale(${Math.round(s * 10000) / 10000})">${composed.svg}</g>`;
}

/** Wraps canvas markup as a standalone SVG document. */
export function canvasDocument(inner: string, size?: { width: number; height: number }): string {
  const w = size?.width ?? CANVAS.w;
  const h = size?.height ?? CANVAS.h;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${w}" height="${h}">${inner}</svg>`;
}

/** A complete standalone SVG document of the design. */
export function designDocument(design: ShirtDesign, ctx: RenderContext, size?: { width: number; height: number }): string {
  return canvasDocument(renderDesign(design, ctx), size);
}
