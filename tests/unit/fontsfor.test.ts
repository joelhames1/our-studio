// Screens load only the fonts their designs draw with (lib/design/fontsFor.ts),
// so those lists have to be complete: this renders every pairing in every
// layout and every back template, with a font set that notes what's asked
// for, and fails on anything a list leaves out.
import { beforeAll, describe, expect, it } from 'vitest';
import { BACK_TEMPLATES } from '@/lib/design/back/templates';
import { renderBack } from '@/lib/design/back/render';
import { backFonts, frontFonts } from '@/lib/design/fontsFor';
import { LAYOUTS } from '@/lib/design/layouts';
import { PAIRINGS } from '@/lib/design/pairings';
import { renderDesign } from '@/lib/design/render';
import { SAMPLE_FACTS, SEED_DESIGN } from '@/lib/design/seed';
import type { Copy, FontSet, LayoutId, ShirtDesign } from '@/lib/design/types';
import { loadAllFonts } from '@/lib/server/fonts';

let all: FontSet;
beforeAll(async () => {
  all = await loadAllFonts();
});

/** A font set that remembers every font asked for. */
function recording(): { fonts: FontSet; used: Set<string> } {
  const used = new Set<string>();
  const fonts = new Proxy(all, {
    get(target, key) {
      if (typeof key === 'string' && key in target) used.add(key);
      return Reflect.get(target, key);
    },
  });
  return { fonts, used };
}

// Quoted words, an ampersand (some faces borrow it), accents and a middle dot (substitutes), digits.
const COPY: Copy = { headline: 'The "Grand" Café & Co', tagline: 'Zoë’s 40th · 2027', extra: 'Lisbon — Naïve №5' };

describe('the fonts a design needs', () => {
  it('cover everything a front draws with, in every pairing and layout', () => {
    for (const p of PAIRINGS) {
      for (const layout of Object.keys(LAYOUTS) as LayoutId[]) {
        for (const emphasis of ['color', 'script', 'none'] as const) {
          const { fonts, used } = recording();
          const design: ShirtDesign = { ...SEED_DESIGN, pairing: p.id, layout, emphasis, outline: true, shadow: true };
          renderDesign(design, { fonts, copy: COPY, tone: 'light', shirtHex: '#FFFFFF', assetHref: (k) => k });
          const missing = [...used].filter((id) => !frontFonts(p.id).includes(id));
          expect(missing, `${p.id} / ${layout} / ${emphasis}`).toEqual([]);
        }
      }
    }
  });

  it('cover everything a back draws with, in every template, variant and pairing', () => {
    for (const t of BACK_TEMPLATES) {
      for (const v of t.variants) {
        for (const p of [undefined, ...PAIRINGS.map((x) => x.id)]) {
          const { fonts, used } = recording();
          const back = { template: t.id, variant: v.id, size: t.sizes[0], pairing: p };
          renderBack(back, { fonts, copy: COPY, tone: 'light', shirtHex: '#FFFFFF', assetHref: (k) => k, facts: SAMPLE_FACTS, wearer: 'Zoë' }, SEED_DESIGN);
          const missing = [...used].filter((id) => !backFonts(back, SEED_DESIGN).includes(id));
          expect(missing, `${t.id} / ${v.id} / ${p ?? 'front’s pairing'}`).toEqual([]);
        }
      }
    }
  });

  it('are a handful, not all of them', () => {
    expect(frontFonts('bebas-pacifico')).toEqual(['bebas', 'pacifico', 'montserrat-bold', 'montserrat']);
    expect(frontFonts('righteous-caveat')).toContain('montserrat-bold');
    expect(Math.max(...PAIRINGS.map((p) => frontFonts(p.id).length))).toBeLessThanOrEqual(6);
  });
});
