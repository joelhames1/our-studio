// Contact sheets for occasions: every built-in drawing (solid and line, light and
// dark shirt), or starter fronts for each occasion.
// Usage: npx tsx scripts/preview-occasions.ts motifs out.png
//        npx tsx scripts/preview-occasions.ts fronts out.png [occasion]
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { loadAllFonts } from '@/lib/server/fonts';
import { MOTIF_NAMES, motifSvg } from '@/lib/design/motifs';
import { garmentColor, inksFor } from '@/lib/design/palettes';
import { renderDesign } from '@/lib/design/render';
import { generateFresh, seeded } from '@/lib/design/generate';
import { OCCASION_PRESETS, preset } from '@/lib/design/occasions';
import type { MotifId } from '@/lib/design/types';
import type { Occasion } from '@/lib/design/back/types';

const esc = (s: string) => s.replace(/&/g, '&amp;');

function sheet(cells: { bg: string; inner: string; label: string; viewBox: string }[], cols: number, cw: number, ch: number): Buffer {
  const rows = Math.ceil(cells.length / cols);
  let body = '';
  cells.forEach((c, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    body += `<rect x="${x + 5}" y="${y + 5}" width="${cw - 10}" height="${ch - 10}" rx="18" fill="${c.bg}"/>`;
    body += `<svg x="${x + 20}" y="${y + 20}" width="${cw - 40}" height="${ch - 70}" viewBox="${c.viewBox}">${c.inner}</svg>`;
    body += `<text x="${x + cw / 2}" y="${y + ch - 22}" font-size="20" text-anchor="middle" fill="#777" font-family="sans-serif">${esc(c.label)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}"><rect width="100%" height="100%" fill="#d8d2c6"/>${body}</svg>`;
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: Math.min(3000, cols * cw) }, font: { loadSystemFonts: true } }).render().asPng());
}

async function main() {
  const [mode, out = 'occasions.png', occ] = process.argv.slice(2);
  if (mode === 'motifs') {
    const only = process.env.ONLY?.split(',');
    const ids = (Object.keys(MOTIF_NAMES) as MotifId[]).filter((m) => m !== 'none' && (!only || only.includes(m)));
    const cells = [];
    for (const id of ids) {
      for (const [shirt, line] of [['white', false], ['navy', false], ['white', true]] as const) {
        const g = garmentColor(shirt);
        const inks = inksFor(process.env.PALETTE ?? 'sunset', { hex: g.hex, tone: g.tone });
        cells.push({ bg: g.hex, inner: motifSvg(id, inks, { line }), label: `${MOTIF_NAMES[id]}${line ? ' (line)' : ''}`, viewBox: '0 0 1000 1000' });
      }
    }
    fs.writeFileSync(out, sheet(cells, 6, 360, 400));
  } else {
    const fonts = await loadAllFonts();
    const list = occ ? [preset(occ as Occasion)] : OCCASION_PRESETS;
    const cells = [];
    for (const p of list) {
      const designs = generateFresh({ vibes: [], count: occ ? 12 : 4, rand: seeded(7), occasions: [p.id] });
      const copy = p.copyIdeas(p.example)[0];
      for (const d of designs) {
        const g = garmentColor(process.env.SHIRT ?? 'white');
        cells.push({ bg: g.hex, inner: renderDesign(d, { fonts, copy, tone: g.tone, shirtHex: g.hex, assetHref: (k) => k }), label: `${p.short}: ${d.layout} / ${d.art.kind === 'motif' ? d.art.motif : d.art.kind}`, viewBox: '0 0 1500 1800' });
      }
    }
    fs.writeFileSync(out, sheet(cells, 4, 500, 620));
  }
  console.log('wrote', out);
}

main();
