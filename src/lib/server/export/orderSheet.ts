// One-page PDF to hand (or email) to the print shop.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export interface OrderSheetInput {
  title: string;
  approvedBy: string;
  approvedAt: string;
  mockupPng: Buffer;
  garment: string;
  shirtColor: { name: string; hex: string };
  placement: string;
  printSize: string;
  printFile: { name: string; px: string };
  inks: string[];
  wording: { label: string; text: string }[];
  sizes: { who: string; size: string; qty: number }[];
  notes: string;
  files: string[];
  /** Second page, when something is printed on the back. */
  back?: {
    mockupPng: Buffer;
    placement: string;
    printSize: string;
    files: { name: string; px: string }[];
    wording: string[];
    /** Personal backs: whose name is on which file. */
    names: string[];
    inks: string[];
  } | null;
}

const INK = rgb(0.11, 0.17, 0.2);
const MUTED = rgb(0.42, 0.47, 0.5);
const LAGOON = rgb(0.055, 0.486, 0.525);
const LINE = rgb(0.91, 0.88, 0.82);

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Helvetica only knows WinAnsi characters; swap anything else for something printable. */
function safe(font: PDFFont, text: string): string {
  return Array.from(text)
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = safe(font, text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildOrderSheet(input: OrderSheetInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.title}: print order`);
  pdf.setCreator('Our Studio');
  const page: PDFPage = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  let y = 792 - M;

  const text = (t: string, x: number, yy: number, size = 10, font = regular, color = INK) =>
    page.drawText(safe(font, t), { x, y: yy, size, font, color });

  text('PRINT ORDER', M, y, 9, bold, LAGOON);
  y -= 26;
  text(input.title, M, y, 22, bold);
  y -= 16;
  text(`Approved by ${input.approvedBy} on ${input.approvedAt}`, M, y, 10, regular, MUTED);
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: LINE });
  y -= 14;

  // Mockup on the left
  const img = await pdf.embedPng(input.mockupPng);
  const imgW = 250;
  const imgH = (img.height / img.width) * imgW;
  page.drawImage(img, { x: M, y: y - imgH, width: imgW, height: imgH });

  // Specs on the right
  const sx = M + imgW + 22;
  const sw = 612 - M - sx;
  let sy = y - 4;
  const spec = (label: string, value: string) => {
    text(label.toUpperCase(), sx, sy, 7.5, bold, MUTED);
    sy -= 12;
    for (const l of wrap(regular, value, 10.5, sw)) {
      text(l, sx, sy, 10.5);
      sy -= 13.5;
    }
    sy -= 6;
  };
  spec('Garment', input.garment);
  spec('Shirt color', `${input.shirtColor.name} (${input.shirtColor.hex})`);
  spec('Placement', input.placement);
  spec('Print size', input.printSize);
  spec('Print file', `${input.printFile.name}: ${input.printFile.px}, 300 DPI, transparent background, sRGB. Print at 100% scale.`);
  spec('Back', input.back ? `Yes: ${input.back.printSize}. Details on page 2.` : 'Nothing on the back.');
  text('INK COLORS', sx, sy, 7.5, bold, MUTED);
  sy -= 18;
  input.inks.slice(0, 12).forEach((hex, i) => {
    const cx = sx + (i % 6) * 44;
    const cy = sy - Math.floor(i / 6) * 30;
    page.drawRectangle({ x: cx, y: cy, width: 16, height: 16, color: hexToRgb(hex), borderColor: LINE, borderWidth: 0.75 });
    text(hex.toUpperCase(), cx - 4, cy - 9, 6.5, regular, MUTED);
  });
  sy -= Math.ceil(Math.min(input.inks.length, 12) / 6) * 30 + 4;

  y = Math.min(y - imgH, sy) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: LINE });
  y -= 22;

  // Exact wording
  text('EXACT WORDING (please check against the file)', M, y, 7.5, bold, MUTED);
  y -= 16;
  for (const w of input.wording) {
    if (!w.text.trim()) continue;
    text(`${w.label}:`, M, y, 10, bold);
    for (const l of wrap(regular, w.text.replace(/\n/g, ' / '), 11, 612 - M * 2 - 70)) {
      text(l, M + 70, y, 11);
      y -= 15;
    }
    y -= 3;
  }
  y -= 8;

  // Sizes on the left, the file list beside them.
  const sizesTop = y;
  text('SIZES AND QUANTITIES', M, y, 7.5, bold, MUTED);
  y -= 16;
  const cols = [M, M + 200, M + 280];
  text('For', cols[0], y, 9, bold, MUTED);
  text('Size', cols[1], y, 9, bold, MUTED);
  text('Qty', cols[2], y, 9, bold, MUTED);
  y -= 14;
  let total = 0;
  for (const s of input.sizes) {
    text(s.who || '-', cols[0], y, 10.5);
    text(s.size, cols[1], y, 10.5);
    text(String(s.qty), cols[2], y, 10.5);
    total += s.qty;
    y -= 15;
  }
  page.drawLine({ start: { x: M, y: y + 9 }, end: { x: M + 320, y: y + 9 }, thickness: 0.75, color: LINE });
  text('Total', cols[0], y - 4, 10.5, bold);
  text(String(total), cols[2], y - 4, 10.5, bold);
  y -= 30;

  if (input.notes.trim()) {
    text('NOTES', M, y, 7.5, bold, MUTED);
    y -= 15;
    for (const l of wrap(regular, input.notes, 10.5, 612 - M * 2)) {
      text(l, M, y, 10.5);
      y -= 14;
    }
    y -= 10;
  }

  // The file list sits beside the sizes, or on its own page if there's no room.
  let filesPage = page;
  let filesTop = sizesTop;
  const fx = M + 340;
  if (filesTop - 13 - input.files.length * 11 < 36) {
    filesPage = pdf.addPage([612, 792]);
    filesTop = 792 - M;
  }
  filesPage.drawText('FILES IN THIS PACKAGE', { x: fx, y: filesTop, size: 7.5, font: bold, color: MUTED });
  let fy = filesTop - 13;
  for (const f of input.files) {
    filesPage.drawText(safe(regular, `- ${f}`), { x: fx, y: fy, size: 8, font: regular, color: MUTED });
    fy -= 11;
  }

  if (input.back) await backPage(pdf, input, regular, bold);

  return Buffer.from(await pdf.save());
}

async function backPage(pdf: PDFDocument, input: OrderSheetInput, regular: PDFFont, bold: PDFFont) {
  const back = input.back!;
  const page = pdf.addPage([612, 792]);
  const M = 48;
  let y = 792 - M;
  const text = (t: string, x: number, yy: number, size = 10, font = regular, color = INK) => page.drawText(safe(font, t), { x, y: yy, size, font, color });

  text('PRINT ORDER: THE BACK', M, y, 9, bold, LAGOON);
  y -= 26;
  text(input.title, M, y, 22, bold);
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: LINE });
  y -= 14;

  const img = await pdf.embedPng(back.mockupPng);
  const imgW = 250;
  const imgH = (img.height / img.width) * imgW;
  page.drawImage(img, { x: M, y: y - imgH, width: imgW, height: imgH });

  const sx = M + imgW + 22;
  const sw = 612 - M - sx;
  let sy = y - 4;
  const spec = (label: string, value: string) => {
    text(label.toUpperCase(), sx, sy, 7.5, bold, MUTED);
    sy -= 12;
    for (const l of wrap(regular, value, 10.5, sw)) {
      text(l, sx, sy, 10.5);
      sy -= 13.5;
    }
    sy -= 6;
  };
  spec('Placement', back.placement);
  spec('Print size', back.printSize);
  spec(
    back.files.length > 1 ? 'Print files (one per shirt)' : 'Print file',
    back.files.map((f) => `${f.name}: ${f.px}`).join('; ') + '. 300 DPI, transparent background, sRGB. Print at 100% scale.',
  );
  if (back.names.length) spec('Names', `Each shirt's back has its wearer's name: ${back.names.join(', ')}. Match the file name to the name in the sizes list on page 1.`);
  text('INK COLORS', sx, sy, 7.5, bold, MUTED);
  sy -= 18;
  back.inks.slice(0, 12).forEach((hex, i) => {
    const cx = sx + (i % 6) * 44;
    const cy = sy - Math.floor(i / 6) * 30;
    page.drawRectangle({ x: cx, y: cy, width: 16, height: 16, color: hexToRgb(hex), borderColor: LINE, borderWidth: 0.75 });
    text(hex.toUpperCase(), cx - 4, cy - 9, 6.5, regular, MUTED);
  });
  sy -= Math.ceil(Math.min(back.inks.length, 12) / 6) * 30 + 4;

  y = Math.min(y - imgH, sy) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 1, color: LINE });
  y -= 22;
  text('EXACT WORDING ON THE BACK (please check against the file)', M, y, 7.5, bold, MUTED);
  y -= 16;
  for (const w of back.wording) {
    for (const l of wrap(regular, w, 11, 612 - M * 2)) {
      if (y < 50) return;
      text(l, M, y, 11);
      y -= 15;
    }
  }
}
