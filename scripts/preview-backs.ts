// Contact sheet of every back template and variant, for eyeballing.
// Usage: npx tsx scripts/preview-backs.ts [out.png] [shirt color id] [occasion]
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { loadAllFonts } from '@/lib/server/fonts';
import { garmentColor } from '@/lib/design/palettes';
import { SEED_COPY, SEED_DESIGN } from '@/lib/design/seed';
import { BACK_TEMPLATES } from '@/lib/design/back/templates';
import { renderBack } from '@/lib/design/back/render';
import { blankFacts } from '@/lib/design/back/facts';
import { SAMPLE_FACTS } from '@/lib/design/seed';
import type { BackDesign, Occasion } from '@/lib/design/back/types';

async function main() {
  const out = process.argv[2] ?? 'backs.png';
  const shirt = garmentColor(process.argv[3] ?? 'white');
  const occasion = process.argv[4] as Occasion | undefined;
  const facts = occasion ? blankFacts(occasion) : SAMPLE_FACTS;
  const fonts = await loadAllFonts();
  const backs: (BackDesign & { label: string })[] = [];
  for (const t of BACK_TEMPLATES) for (const v of t.variants) backs.push({ template: t.id, variant: v.id, size: t.sizes[0], label: `${t.name} / ${v.name}` });
  const only = process.env.ONLY;
  const list = only ? backs.filter((b) => b.template === only) : backs;
  const cols = Math.min(5, list.length);
  const cw = 600;
  const ch = 760;
  const rows = Math.ceil(list.length / cols);
  let body = '';
  list.forEach((b, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    const inner = renderBack(b, { fonts, copy: SEED_COPY, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k) => k, facts, wearer: 'Erin' }, SEED_DESIGN);
    body += `<rect x="${x + 6}" y="${y + 6}" width="${cw - 12}" height="${ch - 12}" rx="20" fill="${shirt.hex}"/>`;
    body += `<svg x="${x + 25}" y="${y + 25}" width="${cw - 50}" height="${ch - 90}" viewBox="0 0 1500 1800">${inner}</svg>`;
    body += `<text x="${x + cw / 2}" y="${y + ch - 22}" font-size="22" text-anchor="middle" fill="#666" font-family="sans-serif">${b.label.replace(/&/g, "&amp;")}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="#d8d2c6"/>${body}</svg>`;
  fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: Math.min(3000, cols * cw) }, font: { loadSystemFonts: true } }).render().asPng());
  console.log('wrote', out, list.length, 'backs');
}

main();
