import { pairing as getPairing } from './pairings';
import { runsFor, smartQuotes } from './text';
import type { Copy, Inks, ShirtDesign, TextRole } from './types';

const NO_INKS = { text: '#000', accent: '#000' } as Inks;

/** Text exactly as it will print: curly quotes, capitals and all. */
export function printedText(text: string, role: TextRole, design: ShirtDesign): string {
  const p = getPairing(design.pairing);
  return smartQuotes(text)
    .split('\n')
    .map((line) =>
      runsFor(line, { role, pairing: p, inks: NO_INKS, emphasis: design.emphasis ?? p.defaultEmphasis })
        .map((r) => r.text)
        .join(''),
    )
    .join('\n');
}

export function printedCopy(design: ShirtDesign, copy: Copy): { label: string; text: string }[] {
  const p = getPairing(design.pairing);
  return [
    { label: 'Big words', text: printedText(copy.headline, p.headline, design) },
    { label: 'Small words', text: printedText(copy.tagline, p.tagline, design) },
    { label: 'Tiny line', text: printedText(copy.extra, p.extra, design) },
  ].filter((l) => l.text.trim());
}
