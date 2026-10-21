'use client';
import { memo, useId, useMemo, type MouseEvent } from 'react';
import { partFromProbe, PROBE_COLORS } from '@/lib/design/colors';
import { renderMockup, type Placement } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import { frontFonts } from '@/lib/design/fontsFor';
import { renderDesign } from '@/lib/design/render';
import type { ColorPart, Copy, GarmentSide, GarmentStyle, ShirtDesign } from '@/lib/design/types';
import { CANVAS } from '@/lib/design/types';
import { useFonts } from '@/lib/client/fonts';
import { previewHref } from '@/lib/design/preview';

// Screen-size copies of painted artwork; print uses the originals.
const assetHref = previewHref;

interface Props {
  design: ShirtDesign;
  copy: Copy;
  style: GarmentStyle;
  color: string;
  view?: 'chest' | 'full' | 'art';
  side?: GarmentSide;
  printWidthIn?: number;
  placement?: Placement;
  className?: string;
  label?: string;
  /** Flat artwork only: tapping a part of the lettering (big words, the tiny line…) reports which. */
  onPickPart?: (part: ColorPart) => void;
}

/** A design on a shirt (or flat), rendered exactly as it will print. */
export const ShirtPreview = memo(function ShirtPreview({
  design,
  copy,
  style,
  color,
  view = 'chest',
  side = 'front',
  printWidthIn,
  placement,
  className = '',
  label,
  onPickPart,
}: Props) {
  const fonts = useFonts(useMemo(() => frontFonts(design.pairing), [design.pairing]));
  const rid = useId();
  const shirt = garmentColor(color);
  const width = printWidthIn ?? (style === 'hoodie' ? 10 : 12);
  const svg = useMemo(() => {
    if (!fonts) return null;
    const inner =
      side === 'front' ? renderDesign(design, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref }) : '';
    if (view === 'art') {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${CANVAS.w + 120} ${CANVAS.h + 120}"><rect x="-60" y="-60" width="${CANVAS.w + 120}" height="${CANVAS.h + 120}" fill="${shirt.hex}"/>${inner}</svg>`;
    }
    return renderMockup({ style, side, colorHex: shirt.hex, tone: shirt.tone, design: inner, printWidthIn: width, placement, id: rid, view });
  }, [fonts, design, copy, shirt.hex, shirt.tone, style, side, view, width, placement, rid]);

  // The same design with each part in its marker color, laid invisibly over the real one.
  const picking = !!onPickPart && view === 'art' && side === 'front';
  const probe = useMemo(() => {
    if (!fonts || !picking) return null;
    // Painted artwork isn't a part, and leaving it out keeps the copy from loading anything.
    const inner = renderDesign({ ...design, colors: PROBE_COLORS }, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref: () => '' }).replace(/<image\b[^>]*\/>/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${CANVAS.w + 120} ${CANVAS.h + 120}">${inner}</svg>`;
  }, [fonts, picking, design, copy, shirt.tone, shirt.hex]);

  const aspect = view === 'art' ? `${CANVAS.w + 120} / ${CANVAS.h + 120}` : view === 'full' ? '1000 / 760' : '10 / 11';
  const preview = (
    <div
      className={`svg-fill relative ${svg ? '' : 'skeleton rounded-2xl'} ${picking ? '' : className}`}
      style={{ aspectRatio: aspect }}
      role="img"
      aria-label={label ?? `${copy.headline} / ${copy.tagline}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
  if (!picking) return preview;
  const pick = (e: MouseEvent) => {
    const part = partFromProbe((e.target as Element).getAttribute?.('fill'));
    if (part) onPickPart!(part);
  };
  return (
    <div className={`relative ${className}`}>
      {preview}
      {probe ? <div aria-hidden="true" onClick={pick} className="svg-fill absolute inset-0 cursor-pointer opacity-0" dangerouslySetInnerHTML={{ __html: probe }} /> : null}
    </div>
  );
});
