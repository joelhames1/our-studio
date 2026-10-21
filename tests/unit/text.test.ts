import { beforeAll, describe, expect, it } from 'vitest';
import { loadAllFonts } from '@/lib/server/fonts';
import { chooseLines, runsFor, segment, smartQuotes } from '@/lib/design/text';
import { pairing } from '@/lib/design/pairings';
import { inksFor } from '@/lib/design/palettes';
import { printedCopy } from '@/lib/design/printed';
import { SEED_COPY, SEED_DESIGN } from '@/lib/design/seed';
import type { FontSet } from '@/lib/design/types';

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadAllFonts();
});

describe('smartQuotes', () => {
  it('curls the seed headline correctly', () => {
    expect(smartQuotes(`Sam & Alex's 25th "Grand" Tour`)).toBe('Sam & Alex’s 25th “Grand” Tour');
  });
  it('treats a leading apostrophe before digits as an apostrophe', () => {
    expect(smartQuotes(`Class of '95`)).toBe('Class of ’95');
  });
  it('opens quotes at the start of a line', () => {
    expect(smartQuotes(`"Hi" she said`)).toBe('“Hi” she said');
  });
});

describe('segment', () => {
  it('finds the emphasized word and the ordinal', () => {
    const segs = segment(smartQuotes(`Sam & Alex's 25th "Grand" Tour`));
    expect(segs.find((s) => s.role === 'emph')?.text).toBe('“Grand”');
    expect(segs.find((s) => s.role === 'ord')?.text).toBe('th');
  });
});

describe('runsFor', () => {
  const p = pairing('bebas-pacifico');
  const inks = inksFor('sunset', { hex: '#ffffff', tone: 'light' });
  it('capitalises plain text but keeps script emphasis in its typed case', () => {
    const runs = runsFor(smartQuotes(`25th "Grand" Tour`), { role: p.headline, pairing: p, inks, emphasis: 'script' });
    const text = runs.map((r) => r.text).join('');
    expect(text).toBe('25TH “Grand” TOUR');
    const emph = runs.find((r) => r.text.includes('Grand'))!;
    expect(emph.style.font).toBe('pacifico');
    expect(emph.style.fill).toBe(inks.accent);
  });
  it('raises and shrinks the ordinal suffix', () => {
    const runs = runsFor('21st', { role: p.headline, pairing: p, inks, emphasis: 'script' });
    const ord = runs.find((r) => r.text === 'ST')!;
    expect(ord.style.scale).toBeLessThan(1);
    expect(ord.style.rise).toBeGreaterThan(0);
  });
});

describe('chooseLines', () => {
  it('breaks the seed headline into balanced lines, never stranding the ampersand', () => {
    const p = pairing('anton-yellowtail');
    const { lines, size } = chooseLines({
      text: SEED_COPY.headline,
      style: { role: p.headline, pairing: p, inks: inksFor('tropical', { hex: '#fff', tone: 'light' }), emphasis: 'script' },
      fonts,
      box: { x: 0, y: 0, w: 1400, h: 900 },
      maxLines: 4,
      maxSize: 430,
      preferLines: 3,
    });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((l) => l.trim() !== '&')).toBe(true);
    expect(lines.every((l) => !l.trim().startsWith('&'))).toBe(true);
    expect(size).toBeGreaterThan(100);
  });
  it('respects explicit line breaks', () => {
    const p = pairing('bebas-pacifico');
    const { lines } = chooseLines({
      text: 'Sam & Alex\nTake Lisbon',
      style: { role: p.headline, pairing: p, inks: inksFor('sunset', { hex: '#fff', tone: 'light' }), emphasis: 'script' },
      fonts,
      box: { x: 0, y: 0, w: 1400, h: 600 },
      maxLines: 3,
      maxSize: 300,
    });
    expect(lines).toEqual(['Sam & Alex', 'Take Lisbon']);
  });
});

describe('printedCopy', () => {
  it('shows exactly what will print for the seed design', () => {
    const lines = printedCopy(SEED_DESIGN, SEED_COPY);
    expect(lines[0].text).toBe('SAM & ALEX’S 25TH “Grand” TOUR');
    expect(lines[1].text).toBe('Let’s Go!');
  });
});
