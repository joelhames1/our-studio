import { beforeAll, describe, expect, it } from 'vitest';
import { loadAllFonts } from '@/lib/server/fonts';
import { renderDesign } from '@/lib/design/render';
import { renderMockup, GARMENT_STYLES } from '@/lib/design/garments';
import { LAYOUTS } from '@/lib/design/layouts';
import { PAIRINGS } from '@/lib/design/pairings';
import { contrast, GARMENT_COLORS, inksFor, PALETTES } from '@/lib/design/palettes';
import { MOTIF_NAMES } from '@/lib/design/motifs';
import { SEED_COPY } from '@/lib/design/seed';
import type { FontSet, LayoutId, MotifId, ShirtDesign } from '@/lib/design/types';

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadAllFonts();
});

const ctx = (tone: 'light' | 'dark') => ({
  fonts,
  copy: SEED_COPY,
  tone,
  shirtHex: tone === 'light' ? '#F7F6F2' : '#1C1C1E',
  assetHref: (k: string) => `/api/assets/${k}`,
});

describe('renderDesign', () => {
  for (const layout of Object.keys(LAYOUTS) as LayoutId[]) {
    for (const tone of ['light', 'dark'] as const) {
      it(`renders ${layout} on a ${tone} shirt as clean outlines`, () => {
        const design: ShirtDesign = { layout, pairing: 'bebas-pacifico', palette: 'lagoon', art: { kind: 'motif', motif: 'sunset-palm' } };
        const svg = renderDesign(design, ctx(tone));
        expect(svg.length).toBeGreaterThan(1000);
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        // Words are converted to paths: nothing depends on fonts at print time.
        expect(svg).not.toMatch(/<text/);
        expect(svg).toMatch(/<path d="M/);
      });
    }
  }

  it('renders every pairing and motif without blowing up', () => {
    for (const p of PAIRINGS) {
      for (const motif of Object.keys(MOTIF_NAMES) as MotifId[]) {
        const svg = renderDesign({ layout: 'stack', pairing: p.id, palette: 'retro', art: { kind: 'motif', motif } }, ctx('light'));
        expect(svg).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('copes with empty taglines and very long headlines', () => {
    const svg = renderDesign(
      { layout: 'badge', pairing: 'alfa-lobster', palette: 'sunset', art: { kind: 'none' } },
      { ...ctx('light'), copy: { headline: 'A very very long headline that goes on and on about the Algarve coast', tagline: '', extra: '' } },
    );
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('escapes artwork keys', () => {
    const svg = renderDesign(
      { layout: 'stack', pairing: 'bebas-pacifico', palette: 'lagoon', art: { kind: 'image', assetKey: 'art/x".png', width: 10, height: 10 } },
      ctx('light'),
    );
    expect(svg).toContain('art/x&quot;.png');
  });
});

describe('mockups', () => {
  it('renders every garment, side and view', () => {
    for (const g of GARMENT_STYLES) {
      for (const side of ['front', 'back'] as const) {
        for (const view of ['full', 'chest'] as const) {
          const svg = renderMockup({ style: g.id, side, colorHex: '#1E2740', tone: 'dark', design: '<g/>', printWidthIn: 12, id: 't:1', view });
          expect(svg.startsWith('<svg')).toBe(true);
          expect(svg).not.toMatch(/NaN/);
          // ids are sanitised (React useId produces colons)
          expect(svg).not.toContain('t:1');
        }
      }
    }
  });
});

describe('inks', () => {
  it('keeps the main text readable on every shirt color in every palette', () => {
    for (const p of PALETTES) {
      for (const c of GARMENT_COLORS) {
        const inks = inksFor(p.id, c);
        expect(contrast(inks.text, c.hex)).toBeGreaterThanOrEqual(2.2);
      }
    }
  });
});
