'use client';
import { memo, useId, useMemo } from 'react';
import { backWidthIn, renderBack, type FrontStyle } from '@/lib/design/back/render';
import type { BackDesign, Facts } from '@/lib/design/back/types';
import { backFonts } from '@/lib/design/fontsFor';
import { printRect, renderMockup } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import type { Copy, GarmentStyle } from '@/lib/design/types';
import { CANVAS } from '@/lib/design/types';
import { useFonts } from '@/lib/client/fonts';
import { previewHref } from '@/lib/design/preview';

// Screen-size copies of painted artwork; print uses the originals.
const assetHref = previewHref;

interface Props {
  back: BackDesign;
  facts: Facts;
  /** The front it's paired with; the back borrows its fonts and colors unless it has its own. */
  front: FrontStyle;
  copy: Copy;
  style: GarmentStyle;
  color: string;
  view?: 'chest' | 'full' | 'art';
  /** Whose name goes on personal backs (jerseys). */
  wearer?: string;
  className?: string;
  label?: string;
}

/** A back design on the back of the shirt, rendered exactly as it will print. */
export const BackPreview = memo(function BackPreview({ back, facts, front, copy, style, color, view = 'chest', wearer, className = '', label }: Props) {
  const fonts = useFonts(useMemo(() => backFonts(back, front), [back, front]));
  const rid = useId();
  const shirt = garmentColor(color);
  const widthIn = backWidthIn(back.size, style);
  const placement = back.size === 'neck' ? 'neck' : 'center';
  const svg = useMemo(() => {
    if (!fonts) return null;
    const inner = renderBack(back, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref, facts, wearer }, front);
    if (view === 'art') {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${CANVAS.w + 120} ${CANVAS.h + 120}"><rect x="-60" y="-60" width="${CANVAS.w + 120}" height="${CANVAS.h + 120}" fill="${shirt.hex}"/>${inner}</svg>`;
    }
    // Close-ups frame the print itself: the whole upper back for a big print,
    // the collar area for a small one.
    let crop: { x: number; y: number; w: number; h: number } | undefined;
    if (view === 'chest') {
      const r = printRect({ style, side: 'back', printWidthIn: widthIn, placement });
      // A small print under the collar gets a tight frame, or it's a speck on a card.
      const w = placement === 'neck' ? 210 : r.w * 1.32;
      crop = { x: 500 - w / 2, y: r.y - (placement === 'neck' ? 60 : 55), w, h: w * 1.1 };
    }
    return renderMockup({ style, side: 'back', colorHex: shirt.hex, tone: shirt.tone, design: inner, printWidthIn: widthIn, placement, id: rid, view: view === 'full' ? 'full' : 'chest', crop });
  }, [fonts, back, facts, front, copy, shirt.hex, shirt.tone, style, view, widthIn, placement, wearer, rid]);

  const aspect = view === 'art' ? `${CANVAS.w + 120} / ${CANVAS.h + 120}` : view === 'full' ? '1000 / 760' : '10 / 11';
  return (
    <div
      className={`svg-fill relative ${svg ? '' : 'skeleton rounded-2xl'} ${className}`}
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={label ?? 'Back of the shirt'}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
});
