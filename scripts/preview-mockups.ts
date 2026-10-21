// Renders the seed design on every garment, front and back, for eyeballing.
// Usage: npx tsx scripts/preview-mockups.ts out.png
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { loadAllFonts } from '@/lib/server/fonts';
import { renderDesign } from '@/lib/design/render';
import { garmentColor } from '@/lib/design/palettes';
import { renderMockup } from '@/lib/design/garments';
import { SEED_COPY, SEED_DESIGN } from '@/lib/design/seed';
import type { GarmentSide, GarmentStyle } from '@/lib/design/types';

async function main() {
  const fonts = await loadAllFonts();
  const cells: string[] = [];
  const combos: [GarmentStyle, GarmentSide, string, 'full' | 'chest'][] = [
    ['tee', 'front', 'white', 'full'],
    ['tee', 'back', 'white', 'full'],
    ['longsleeve', 'front', 'navy', 'full'],
    ['hoodie', 'front', 'heather', 'full'],
    ['hoodie', 'back', 'teal', 'full'],
    ['tee', 'front', 'lagoon', 'chest'],
    ['hoodie', 'front', 'black', 'chest'],
    ['longsleeve', 'front', 'sunshine', 'chest'],
  ];
  combos.forEach(([style, side, color, view], i) => {
    const c = garmentColor(color);
    const design = renderDesign(SEED_DESIGN, { fonts, copy: SEED_COPY, tone: c.tone, shirtHex: c.hex, assetHref: (k) => k });
    const m = renderMockup({ style, side, colorHex: c.hex, tone: c.tone, design: side === 'front' ? design : design, printWidthIn: style === 'hoodie' ? 11 : 12, id: `m${i}`, view });
    const x = (i % 4) * 500;
    const y = Math.floor(i / 4) * 560;
    cells.push(`<svg x="${x}" y="${y}" width="500" height="550">${m.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg')}</svg>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1100"><rect width="100%" height="100%" fill="#EAE4D8"/>${cells.join('')}</svg>`;
  fs.writeFileSync(process.argv[2] ?? 'mockups.png', new Resvg(svg).render().asPng());
}
main();
