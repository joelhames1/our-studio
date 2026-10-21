// Renders a back option on the same 1500 x 1800 canvas as the front, so the
// browser preview, the 3D try-on and the print file all come from one place.
import { safeColors } from '../colors';
import { inksFor } from '../palettes';
import { pairing as getPairing } from '../pairings';
import { canvasDocument, fitToCanvas } from '../render';
import { SEED_DESIGN } from '../seed';
import type { Emphasis, Inks, PartColors, ShirtDesign } from '../types';
import type { BackContext, BackKit } from './kit';
import { backTemplate } from './templates';
import type { BackDesign, BackSize } from './types';

export type FrontStyle = Pick<ShirtDesign, 'pairing' | 'palette' | 'emphasis' | 'colors'>;

export interface BackStyle {
  pairing: string;
  palette: string;
  emphasis: Emphasis;
  /** Word colors picked on the front, when the back matches its colors. */
  colors?: PartColors;
}

/** Fonts and colors for a back: its own if set, otherwise the front's. */
export function backStyle(back: BackDesign, front?: FrontStyle | null): BackStyle {
  const pairing = back.pairing ?? front?.pairing ?? SEED_DESIGN.pairing;
  const palette = back.palette ?? front?.palette ?? SEED_DESIGN.palette;
  const emphasis = (back.pairing ? undefined : front?.emphasis) ?? getPairing(pairing).defaultEmphasis;
  const colors = safeColors(back.palette ? back.colors : front?.colors);
  return { pairing, palette, emphasis, ...(colors ? { colors } : {}) };
}

/** The back with "match the front" filled in, as it gets frozen at approval. */
export function resolveBack(back: BackDesign, front?: FrontStyle | null): BackDesign {
  const s = backStyle(back, front);
  return { ...back, pairing: s.pairing, palette: s.palette, ...(s.colors ? { colors: s.colors } : {}) };
}

/**
 * The front's picked colors in the back's inks: big words for its main text,
 * small words (or quoted ones) for its accent, plus the outline and shadow.
 */
function withColors(inks: Inks, c?: PartColors): Inks {
  if (!c) return inks;
  return {
    ...inks,
    text: c.headline ?? inks.text,
    accent: c.tagline ?? c.emphasis ?? inks.accent,
    outline: c.outline ?? inks.outline,
    shadow: c.shadow ?? inks.shadow,
  };
}

/** The variant to draw: the one asked for if the template has it. */
function normalize(back: BackDesign): BackDesign {
  const t = backTemplate(back.template);
  const variant = t.variants.some((v) => v.id === back.variant) ? back.variant : t.variants[0].id;
  const size = t.sizes.includes(back.size) ? back.size : t.sizes[0];
  return { ...back, template: t.id, variant, size };
}

export function composeBack(back: BackDesign, ctx: BackContext, front?: FrontStyle | null) {
  const b = normalize(back);
  const style = backStyle(b, front);
  const k: BackKit = {
    back: b,
    ctx,
    facts: ctx.facts,
    fonts: ctx.fonts,
    inks: withColors(inksFor(style.palette, { hex: ctx.shirtHex, tone: ctx.tone }), style.colors),
    picked: style.colors,
    pairing: getPairing(style.pairing),
    emphasis: style.emphasis,
    wearer: ctx.wearer?.trim() || ctx.facts.people.find((p) => p.trim()) || 'Name',
    words: [],
  };
  const composed = backTemplate(b.template).build(k);
  return { ...composed, words: k.words };
}

/** SVG markup for the canvas (no outer <svg>). */
export function renderBack(back: BackDesign, ctx: BackContext, front?: FrontStyle | null): string {
  return fitToCanvas(composeBack(back, ctx, front));
}

export function backDocument(back: BackDesign, ctx: BackContext, front?: FrontStyle | null, size?: { width: number; height: number }): string {
  return canvasDocument(renderBack(back, ctx, front), size);
}

/** Every word the back prints, exactly as printed, for the spelling check. */
export function backWords(back: BackDesign, ctx: BackContext, front?: FrontStyle | null): string[] {
  return composeBack(back, ctx, front).words;
}

/** Print width in inches. A big back print, or a small one under the collar. */
export function backWidthIn(size: BackSize, style: 'tee' | 'longsleeve' | 'hoodie'): number {
  if (size === 'neck') return 3.5;
  return style === 'hoodie' ? 11 : 12;
}
