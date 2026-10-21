// Builds everything the print shop needs once Erin approves a design.
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { GARMENT_STYLES, printPreset, printSizeIn } from '@/lib/design/garments';
import { inksIn } from '@/lib/design/colors';
import { garmentColor } from '@/lib/design/palettes';
import { pairing as getPairing } from '@/lib/design/pairings';
import { printedText } from '@/lib/design/printed';
import { inksFor } from '@/lib/design/palettes';
import type { Copy, ShirtDesign } from '@/lib/design/types';
import type { Decision, PackageFile } from '@/lib/engine/types';
import type { ShirtSnapshot } from '@/lib/kinds/shirt';
import { nameOf } from '../people';
import { loadAllFonts } from '../fonts';
import { getImageProvider } from '../providers';
import { getRepo } from '../repo';
import { contentTypeFor } from '../repo/types';
import { slugify } from '../ids';
import { reserveSpend } from '../spend';
import { buildOrderSheet } from './orderSheet';
import { backTemplate } from '@/lib/design/back/templates';
import { backWords as wordsOnBack } from '@/lib/design/back/render';
import { renderDesign } from '@/lib/design/render';
import { DPI, backInner, backSvg, designSvg, renderBackMockupPng, renderMockupPng, renderPairPng, renderPrintPng, type BackJob } from './render';

/** A 4x upscale costs well under a cent on fal; held at a rounder number. */
const UPSCALE_USD = 0.01;

const dataUri = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString('base64')}`;

/**
 * Makes sure AI artwork is sharp enough for print: AI upscaling when an image
 * service is connected, high-quality resampling otherwise. Cached per artwork.
 */
async function prepareArt(design: ShirtDesign, targetPx: number): Promise<(key: string) => string> {
  const art = design.art;
  if (art.kind === 'svg') {
    const asset = await getRepo().getAsset(art.assetKey);
    if (!asset) throw new Error('The artwork file is missing.');
    const uri = dataUri(asset.data, 'image/svg+xml');
    return () => uri;
  }
  if (art.kind !== 'image') return () => '';
  const repo = getRepo();
  const printKey = art.assetKey.replace(/\.(png|jpe?g|webp)$/i, '') + '@print.png';
  let print = await repo.getAsset(printKey);
  if (!print) {
    const original = await repo.getAsset(art.assetKey);
    if (!original) throw new Error('The artwork file is missing.');
    // Art fills at most ~70% of the canvas width.
    const needed = Math.round(targetPx * 0.7);
    let buf = original.data;
    let width = (await sharp(buf).metadata()).width ?? 0;
    if (width < needed) {
      const provider = getImageProvider();
      if (provider.upscale) {
        try {
          const settle = await reserveSpend(provider.id, 'upscale', UPSCALE_USD, 'print upscale');
          try {
            buf = await provider.upscale(buf);
          } finally {
            await settle(UPSCALE_USD);
          }
          width = (await sharp(buf).metadata()).width ?? width;
        } catch (e) {
          console.error('AI upscale failed, falling back to resampling', e);
        }
      }
      if (width < needed) buf = await sharp(buf).resize({ width: needed, kernel: 'lanczos3' }).png().toBuffer();
    }
    buf = await sharp(buf).ensureAlpha().png().toBuffer();
    await repo.putAsset(printKey, buf, 'image/png');
    print = { data: buf, contentType: 'image/png' };
  }
  const uri = dataUri(print.data, 'image/png');
  return () => uri;
}

/** The distinct solid ink colors in a print SVG. */
export const fmtIn = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "Erin" → "ERIN", safe for a file name. */
const nameSlug = (n: string) => n.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase() || 'NAME';

export async function buildShirtPackage(decision: Decision<ShirtSnapshot>, projectTitle: string): Promise<PackageFile[]> {
  const snap = decision.snapshot;
  const repo = getRepo();
  const fonts = await loadAllFonts();
  const color = garmentColor(snap.color);
  const preset = printPreset(snap.preset);
  const size = printSizeIn(preset);
  const printPx = Math.round(size.w * DPI);
  const copy: Copy = snap.copy;
  const design = snap.design;
  const art = await prepareArt(design, 4500);
  const face = { hex: color.hex, tone: color.tone };
  const altFace = color.tone === 'light' ? { hex: '#1C1C1E', tone: 'dark' as const } : { hex: '#F7F6F2', tone: 'light' as const };
  const dims = `${fmtIn(size.w)}x${fmtIn(size.h)}in`;

  const vector = designSvg(design, copy, fonts, face, art, size.w);
  const main = await renderPrintPng(vector, printPx);
  const master = preset.widthIn === 15 ? null : await renderPrintPng(designSvg(design, copy, fonts, face, art, 15), 4500);
  const alt = await renderPrintPng(designSvg(design, copy, fonts, altFace, art, size.w), printPx);
  const styleName = GARMENT_STYLES.find((g) => g.id === snap.garment)?.name ?? snap.garment;
  const mockup = await renderMockupPng(design, copy, fonts, { style: snap.garment, hex: color.hex, tone: color.tone, printWidthIn: preset.widthIn, placement: preset.placement }, art);

  // --- the back --------------------------------------------------------------------
  const b = snap.back ?? null;
  type Bin = { name: string; data: Buffer; label: string; px?: string };
  const backFiles: Bin[] = [];
  let backMockup: Buffer | null = null;
  let pairMockup: Buffer | null = null;
  let backWords: string[] = [];
  let backDims = '';
  if (b) {
    const bt = backTemplate(b.design.template);
    const backSize = { w: b.widthIn, h: Math.round(b.widthIn * 1.2 * 10) / 10 };
    backDims = `${fmtIn(backSize.w)}x${fmtIn(backSize.h)}in`;
    const backPx = Math.round(backSize.w * DPI);
    const people = bt.personal ? (b.names.length ? b.names : b.facts.people.slice(0, 1)) : [undefined];
    const job = (wearer?: string): BackJob => ({ design: b.design, facts: b.facts, front: design, copy, wearer });
    for (const who of people) {
      const svg = backSvg(job(who), fonts, face, backSize.w);
      const out = await renderPrintPng(svg, backPx);
      const name = who ? `print-file-back-${nameSlug(who)}-${backDims}.png` : `print-file-back-${backDims}.png`;
      backFiles.push({ name, data: out.png, label: who ? `Back print file: ${who}` : 'Back print file', px: `${out.width} × ${out.height} px` });
    }
    const first = job(people[0]);
    backFiles.push({ name: 'back-vector.svg', data: Buffer.from(backSvg(first, fonts, face, backSize.w)), label: 'Back, vector version' });
    const altBack = await renderPrintPng(backSvg(first, fonts, altFace, backSize.w), backPx);
    backFiles.push({ name: `extras/back-for-${altFace.tone}-shirts-${backDims}.png`, data: altBack.png, label: `Back, version for ${altFace.tone} shirts` });
    const placementB = b.design.size === 'neck' ? 'neck' : 'center';
    const innerB = backInner(first, fonts, face);
    backMockup = renderBackMockupPng(innerB, { style: snap.garment, hex: color.hex, tone: color.tone }, b.widthIn, placementB);
    const innerF = renderDesign(design, { fonts, copy, tone: face.tone, shirtHex: face.hex, assetHref: art });
    pairMockup = renderPairPng(innerF, innerB, { style: snap.garment, hex: color.hex, tone: color.tone }, { printWidthIn: preset.widthIn, placement: preset.placement }, { printWidthIn: b.widthIn, placement: placementB });
    backWords = wordsOnBack(b.design, { fonts, copy, tone: face.tone, shirtHex: face.hex, assetHref: () => '', facts: b.facts, wearer: people[0] }, design);
  }

  const mainName = `print-file-front-${dims}.png`;
  const names = {
    main: mainName,
    sheet: 'order-sheet.pdf',
    mockup: 'shirt-preview.png',
    vector: 'design-vector.svg',
    master: 'extras/master-15x18in-4500x5400.png',
    alt: `extras/version-for-${altFace.tone}-shirts-${dims}.png`,
    readme: 'README.txt',
  };
  const backPrintFiles = backFiles.filter((f) => f.name.startsWith('print-file-back'));
  const fileList = [
    names.main,
    ...backPrintFiles.map((f) => f.name),
    names.sheet,
    names.mockup,
    ...(b ? ['shirt-preview-back.png', 'shirt-preview-both-sides.png'] : []),
    names.vector,
    ...backFiles.filter((f) => !f.name.startsWith('print-file-back')).map((f) => f.name),
    ...(master ? [names.master] : []),
    names.alt,
  ];

  const pairing = getPairing(design.pairing);
  const approvedAt = new Date(decision.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const placement =
    preset.placement === 'left-chest'
      ? 'Front, left chest (wearer’s left), top about 3 in below the collar'
      : 'Front, centered, top of the design about 3 in below the collar';
  const sheet = await buildOrderSheet({
    title: projectTitle,
    approvedBy: await nameOf(decision.approvedBy),
    approvedAt,
    mockupPng: mockup,
    back: b
      ? {
          mockupPng: backMockup!,
          placement:
            b.design.size === 'neck'
              ? snap.garment === 'hoodie'
                ? 'Back, small, centered just below where the hood lies'
                : 'Back, small, centered about 1 in below the collar'
              : snap.garment === 'hoodie'
                ? 'Back, centered, top of the design about 2 in below where the hood lies'
                : 'Back, centered, top of the design about 3 in below the collar',
          printSize: `${fmtIn(b.widthIn)} × ${fmtIn(Math.round(b.widthIn * 12) / 10)} in`,
          files: backPrintFiles.map((f) => ({ name: f.name, px: f.px ?? '' })),
          wording: backWords,
          names: b.names,
          inks: inksIn(backSvg({ design: b.design, facts: b.facts, front: design, copy, wearer: b.names[0] }, fonts, face)),
        }
      : null,
    garment: `${styleName}${snap.garment === 'hoodie' ? ' (pullover)' : ''}`,
    shirtColor: { name: color.name, hex: color.hex },
    placement,
    printSize: `${fmtIn(size.w)} × ${fmtIn(size.h)} in (${preset.name.toLowerCase()})`,
    printFile: { name: mainName, px: `${main.width} × ${main.height} px` },
    inks: inksIn(vector).length ? inksIn(vector) : [inksFor(design.palette, face).text],
    wording: [
      { label: 'Headline', text: printedText(copy.headline, pairing.headline, design) },
      { label: 'Tagline', text: printedText(copy.tagline, pairing.tagline, design) },
      { label: 'Small line', text: printedText(copy.extra, pairing.extra, design) },
    ],
    sizes: snap.sizes,
    notes: snap.notes,
    files: fileList,
  });

  const readme = [
    `${projectTitle}: print package`,
    `Approved ${approvedAt}.`,
    '',
    b ? 'Send the shop these:' : 'Send the shop these two things:',
    `  1. ${names.main}  (the front print file: ${main.width} x ${main.height} px, 300 DPI, transparent background)`,
    ...backPrintFiles.map((f, i) => `  ${i + 2}. ${f.name}  (${backPrintFiles.length > 1 ? `the back for one person's shirt` : 'the back print file'}: ${f.px?.replace(' × ', ' x ')}, 300 DPI, transparent background)`),
    `  ${backPrintFiles.length + 2}. ${names.sheet}  (shirt, color, sizes, placement, exact wording${b ? ', front and back' : ''})`,
    ...(backPrintFiles.length > 1 ? ['', 'Each shirt gets its own back with that person’s name: match the file name to the name on the order sheet.'] : []),
    '',
    'Print at 100% scale. Nothing behind the design is meant to print (the background is transparent).',
    '',
    'Also included:',
    `  ${names.mockup}  a picture of the finished shirt`,
    ...(b ? ['  shirt-preview-back.png  the back of the shirt', '  shirt-preview-both-sides.png  front and back together'] : []),
    `  ${names.vector}  vector version (sharp at any size; handy for screen printers)`,
    ...(master ? [`  ${names.master}  the same design at the standard 15 x 18 in master size`] : []),
    `  ${names.alt}  inks adjusted for ${altFace.tone} shirts, in case you switch colors`,
    ...backFiles.filter((f) => !f.name.startsWith('print-file-back')).map((f) => `  ${f.name}  ${f.label.toLowerCase()}`),
    '',
    'Made with Our Studio.',
  ].join('\n');

  const binaries: [string, Buffer][] = [
    [names.main, main.png],
    ...backFiles.map((f) => [f.name, f.data] as [string, Buffer]),
    ...(b ? ([['shirt-preview-back.png', backMockup!], ['shirt-preview-both-sides.png', pairMockup!]] as [string, Buffer][]) : []),
    [names.sheet, sheet],
    [names.mockup, mockup],
    [names.vector, Buffer.from(vector)],
    ...(master ? ([[names.master, master.png]] as [string, Buffer][]) : []),
    [names.alt, alt.png],
    [names.readme, Buffer.from(readme)],
  ];

  const folder = `${slugify(projectTitle) || 'shirt'}-print-package`;
  const zip = zipSync(
    Object.fromEntries(binaries.map(([n, b]) => [`${folder}/${n}`, [new Uint8Array(b), { level: n.endsWith('.png') || n.endsWith('.pdf') ? 0 : 6 }]])),
  );

  const prefix = `decisions/${decision.id}`;
  const files: PackageFile[] = [];
  const store = async (name: string, data: Buffer | Uint8Array, label: string) => {
    const key = `${prefix}/${name}`;
    const buf = Buffer.from(data);
    await repo.putAsset(key, buf, contentTypeFor(name));
    files.push({ name, key, bytes: buf.length, contentType: contentTypeFor(name), label });
  };
  await store(`${folder}.zip`, zip, 'Everything (zip)');
  await store(names.main, main.png, b ? 'Front print file' : 'Print file');
  for (const f of backPrintFiles) await store(f.name, f.data, f.label);
  await store(names.sheet, sheet, 'Order sheet for the shop');
  await store(names.mockup, mockup, 'Shirt preview picture');
  await store(names.vector, Buffer.from(vector), 'Vector version');
  if (master) await store(names.master, master.png, 'Master size (15 × 18 in)');
  await store(names.alt, alt.png, `Version for ${altFace.tone} shirts`);
  if (b) {
    await store('shirt-preview-both-sides.png', pairMockup!, 'Front and back picture');
    for (const f of backFiles.filter((x) => !x.name.startsWith('print-file-back'))) await store(f.name, f.data, f.label);
  }
  return files;
}
