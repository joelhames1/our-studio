// Renders a contact sheet of designs to PNG for eyeballing layout changes.
// Usage: npx tsx scripts/preview.ts [out.png] [tone]
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { loadAllFonts } from '@/lib/server/fonts';
import { renderDesign } from '@/lib/design/render';
import { garmentColor } from '@/lib/design/palettes';
import type { ShirtDesign } from '@/lib/design/types';
import { SEED_COPY } from '@/lib/design/seed';

const designs: ShirtDesign[] = [
  { layout: 'stack', pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sunset-clock' } },
  { layout: 'badge', pairing: 'alfa-lobster', palette: 'retro', art: { kind: 'motif', motif: 'sunset-palm' } },
  { layout: 'arch', pairing: 'oswald-pacifico', palette: 'lagoon', art: { kind: 'motif', motif: 'hourglass-island' } },
  { layout: 'bigtype', pairing: 'anton-yellowtail', palette: 'tropical', art: { kind: 'motif', motif: 'sun-rays' }, shadow: true },
  { layout: 'ticket', pairing: 'spacemono', palette: 'navygold', art: { kind: 'none' } },
  { layout: 'stamp', pairing: 'rubik-montserrat', palette: 'ink', art: { kind: 'motif', motif: 'plane-sun' } },
  { layout: 'minimal', pairing: 'playfair-montserrat', palette: 'lagoon', art: { kind: 'motif', motif: 'palm-duo' } },
  { layout: 'poster', pairing: 'righteous-caveat', palette: 'coral', art: { kind: 'motif', motif: 'bungalow-sunset' } },
  { layout: 'stack', pairing: 'shrikhand-fredoka', palette: 'pastel', art: { kind: 'motif', motif: 'clock' } },
  { layout: 'badge', pairing: 'dmserif-caveat', palette: 'navygold', art: { kind: 'motif', motif: 'sunset' } },
  { layout: 'stack', pairing: 'abril-josefin', palette: 'retro', art: { kind: 'motif', motif: 'bungalow-sunset' }, outline: true },
  { layout: 'arch', pairing: 'lobster-oswald', palette: 'sunset', art: { kind: 'motif', motif: 'palm-duo' } },
];

async function main() {
  const out = process.argv[2] ?? 'preview.png';
  const shirt = garmentColor(process.argv[3] ?? 'white');
  const fonts = await loadAllFonts();
  const cols = 4;
  const cw = 750;
  const ch = 900;
  const rows = Math.ceil(designs.length / cols);
  let body = '';
  designs.forEach((d, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    const inner = renderDesign(d, { fonts, copy: SEED_COPY, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k) => k });
    body += `<rect x="${x + 6}" y="${y + 6}" width="${cw - 12}" height="${ch - 12}" rx="24" fill="${shirt.hex}"/>`;
    body += `<svg x="${x + 30}" y="${y + 30}" width="${cw - 60}" height="${ch - 60}" viewBox="0 0 1500 1800">${inner}</svg>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}" viewBox="0 0 ${cols * cw} ${rows * ch}"><rect width="100%" height="100%" fill="#d8d2c6"/>${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 2000 } }).render().asPng();
  fs.writeFileSync(out, png);
  console.log('wrote', out);
}

main();
