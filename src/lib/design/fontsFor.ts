// Which shirt fonts a design draws with, so a screen can load just those
// before showing anything, and the rest when it's idle. Every lookup goes
// through text.ts, which borrows missing glyphs from Montserrat; a test renders
// every pairing, layout and back template to keep these lists complete.
import { backStyle, type FrontStyle } from './back/render';
import type { BackDesign } from './back/types';
import { pairing } from './pairings';
import { GLYPH_OVERRIDES } from './text';

/** Plus whatever they borrow from: Montserrat for any missing glyph, and the faces some glyphs are drawn in instead. */
function withBorrowed(ids: string[]): string[] {
  const all = new Set([...ids, 'montserrat']);
  for (const id of [...all]) for (const other of Object.values(GLYPH_OVERRIDES[id] ?? {})) all.add(other);
  return [...all];
}

/** A front design's fonts: its pairing's big words, small words, tiny line and "quoted" words. */
export function frontFonts(pairingId: string): string[] {
  const p = pairing(pairingId);
  return withBorrowed([p.headline.font, p.tagline.font, p.extra.font, p.emphasisFont]);
}

/** A back's fonts: its pairing (its own, or the front's), and the typewriter faces some templates set dates and lists in. */
export function backFonts(back: BackDesign, front?: FrontStyle | null): string[] {
  return withBorrowed([...frontFonts(backStyle(back, front).pairing), 'spacemono', 'spacemono-bold']);
}
