import type { GarmentColor, Inks, Palette, Tone } from './types';

export const PALETTES: Palette[] = [
  {
    id: 'lagoon',
    name: 'Lagoon',
    light: {
      text: '#12355B', accent: '#F2654E', accent2: '#0F8B8D',
      sun: ['#FFD166', '#FFAD5A', '#FF8552', '#F2654E'], water: ['#3CC8C8', '#0F8B8D', '#12355B'],
      art: '#12355B', outline: '#3CC8C8', shadow: '#3CC8C8', panel: '#CDEFEA',
    },
    dark: {
      text: '#F6EEDF', accent: '#FF8A6E', accent2: '#3CC8C8',
      sun: ['#FFD166', '#FFAD5A', '#FF8552', '#F2654E'], water: ['#3CC8C8', '#1C9C9C', '#127174'],
      art: '#F6EEDF', outline: '#0F8B8D', shadow: '#0F8B8D', panel: '#127174',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    light: {
      text: '#3B1F2B', accent: '#E8553E', accent2: '#8E2C68',
      sun: ['#FFD45C', '#FFA64D', '#F7743E', '#E8553E', '#B8325A'], water: ['#8E2C68', '#5B1E4A'],
      art: '#3B1F2B', outline: '#FFA64D', shadow: '#F7743E', panel: '#FFE7C2',
    },
    dark: {
      text: '#FFF1DC', accent: '#FF8A4C', accent2: '#F25F8B',
      sun: ['#FFD45C', '#FFA64D', '#F7743E', '#E8553E', '#B8325A'], water: ['#F25F8B', '#B8325A'],
      art: '#FFF1DC', outline: '#B8325A', shadow: '#B8325A', panel: '#5B1E4A',
    },
  },
  {
    id: 'retro',
    name: 'Retro 70s',
    light: {
      text: '#4A2C1D', accent: '#D9622B', accent2: '#2A7F7F',
      sun: ['#F2C14E', '#E9A23B', '#D9622B', '#A63D1E'], water: ['#2A7F7F', '#1F5E5E'],
      art: '#4A2C1D', outline: '#E9A23B', shadow: '#E9A23B', panel: '#F3E7C9',
    },
    dark: {
      text: '#F3E7C9', accent: '#F2A03D', accent2: '#4FB3A9',
      sun: ['#F2C14E', '#E9A23B', '#D9622B', '#A63D1E'], water: ['#4FB3A9', '#2A7F7F'],
      art: '#F3E7C9', outline: '#A63D1E', shadow: '#A63D1E', panel: '#6B3E26',
    },
  },
  {
    id: 'ink',
    name: 'One Ink',
    light: {
      text: '#1B1B1B', accent: '#1B1B1B', accent2: '#1B1B1B',
      sun: ['#1B1B1B'], water: ['#1B1B1B'],
      art: '#1B1B1B', outline: '#1B1B1B', shadow: '#1B1B1B', panel: '#1B1B1B',
    },
    dark: {
      text: '#F5F2EA', accent: '#F5F2EA', accent2: '#F5F2EA',
      sun: ['#F5F2EA'], water: ['#F5F2EA'],
      art: '#F5F2EA', outline: '#F5F2EA', shadow: '#F5F2EA', panel: '#F5F2EA',
    },
  },
  {
    id: 'navygold',
    name: 'Navy & Gold',
    light: {
      text: '#1F2A44', accent: '#C8963E', accent2: '#3E5A7A',
      sun: ['#E8C26A', '#C8963E', '#A87A2A'], water: ['#3E5A7A', '#1F2A44'],
      art: '#1F2A44', outline: '#C8963E', shadow: '#C8963E', panel: '#EFE3C8',
    },
    dark: {
      text: '#F2E6CC', accent: '#E1B45A', accent2: '#8FA9C7',
      sun: ['#F2D58A', '#E1B45A', '#C8963E'], water: ['#8FA9C7', '#5C7A9C'],
      art: '#F2E6CC', outline: '#C8963E', shadow: '#3E5A7A', panel: '#2C3B5C',
    },
  },
  {
    id: 'tropical',
    name: 'Tropical',
    light: {
      text: '#1E4D3A', accent: '#F2545B', accent2: '#F7B32B',
      sun: ['#FFE066', '#F7B32B', '#F48B3A', '#F2545B'], water: ['#2AB7CA', '#1E8A9C'],
      art: '#1E4D3A', outline: '#F7B32B', shadow: '#2AB7CA', panel: '#D7F2E3',
    },
    dark: {
      text: '#FDF6E3', accent: '#FF6B70', accent2: '#FFD23F',
      sun: ['#FFE066', '#F7B32B', '#F48B3A', '#F2545B'], water: ['#2AB7CA', '#1E8A9C'],
      art: '#FDF6E3', outline: '#F2545B', shadow: '#1E8A9C', panel: '#1E4D3A',
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    light: {
      text: '#5A4A6B', accent: '#EE7F7F', accent2: '#5FB3A1',
      sun: ['#FFE3A3', '#FFC4A3', '#F7A6A6', '#E79BC0'], water: ['#A8DADC', '#7CC6B6'],
      art: '#5A4A6B', outline: '#A8DADC', shadow: '#A8DADC', panel: '#FBEFF2',
    },
    dark: {
      text: '#FFF4EC', accent: '#F7A6A6', accent2: '#A8DADC',
      sun: ['#FFE3A3', '#FFC4A3', '#F7A6A6', '#E79BC0'], water: ['#A8DADC', '#7CC6B6'],
      art: '#FFF4EC', outline: '#5A4A6B', shadow: '#7CC6B6', panel: '#5A4A6B',
    },
  },
  {
    id: 'coral',
    name: 'Coral Reef',
    light: {
      text: '#2B2D42', accent: '#EF6F6C', accent2: '#17A398',
      sun: ['#FFCB77', '#FE9C7F', '#FE6D73', '#EF6F6C'], water: ['#17C3B2', '#227C9D'],
      art: '#2B2D42', outline: '#FFCB77', shadow: '#17C3B2', panel: '#FEF0E0',
    },
    dark: {
      text: '#FEF9EF', accent: '#FE6D73', accent2: '#17C3B2',
      sun: ['#FFCB77', '#FE9C7F', '#FE6D73', '#EF6F6C'], water: ['#17C3B2', '#227C9D'],
      art: '#FEF9EF', outline: '#227C9D', shadow: '#227C9D', panel: '#227C9D',
    },
  },
];

export const GARMENT_COLORS: GarmentColor[] = [
  { id: 'white', name: 'White', hex: '#F7F6F2', tone: 'light' },
  { id: 'natural', name: 'Natural', hex: '#EDE3CF', tone: 'light' },
  { id: 'heather', name: 'Heather Gray', hex: '#C4C4C1', tone: 'light' },
  { id: 'lagoon', name: 'Lagoon Blue', hex: '#8FD3D6', tone: 'light' },
  { id: 'sunshine', name: 'Sunshine', hex: '#F6D776', tone: 'light' },
  { id: 'coral', name: 'Coral', hex: '#F3907E', tone: 'light' },
  { id: 'sage', name: 'Sage', hex: '#A8BFA0', tone: 'light' },
  { id: 'navy', name: 'Navy', hex: '#1E2740', tone: 'dark' },
  { id: 'black', name: 'Black', hex: '#1C1C1E', tone: 'dark' },
  { id: 'teal', name: 'Deep Teal', hex: '#1F5E66', tone: 'dark' },
  { id: 'forest', name: 'Forest', hex: '#2E4A3B', tone: 'dark' },
  { id: 'plum', name: 'Plum', hex: '#4A2A3F', tone: 'dark' },
];

export function palette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function garmentColor(id: string): GarmentColor {
  return GARMENT_COLORS.find((c) => c.id === id) ?? GARMENT_COLORS[0];
}

// --- color maths -----------------------------------------------------------

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const SAFE: Record<Tone, string> = { light: '#1B1B1B', dark: '#F7F3EA' };

/** A band that vanishes on this shirt borrows the nearest band that doesn't. */
function swapBands(bands: string[], shirtHex: string, fallback: string): string[] {
  const ok = (c: string) => contrast(c, shirtHex) >= 1.12;
  return bands.map((c, i) => {
    if (ok(c)) return c;
    for (let d = 1; d < bands.length; d++) {
      for (const j of [i + d, i - d]) if (bands[j] && ok(bands[j])) return bands[j];
    }
    return fallback;
  });
}

/**
 * Picks the palette variant for the shirt's tone, then swaps out any ink that
 * would vanish on this particular shirt color (coral text on a coral shirt).
 */
export function inksFor(paletteId: string, shirt: { hex: string; tone: Tone }): Inks {
  const base = palette(paletteId)[shirt.tone];
  const fix = (c: string, min: number) => (contrast(c, shirt.hex) >= min ? c : SAFE[shirt.tone]);
  // Decorative inks only get swapped when they'd basically vanish.
  const fixSoft = (c: string, fallback: string) => (contrast(c, shirt.hex) >= 1.12 ? c : fallback);
  const text = fix(base.text, 2.2);
  const art = fix(base.art, 2.0);
  return {
    ...base,
    text,
    art,
    accent: fix(base.accent, 1.5),
    accent2: fixSoft(base.accent2, text),
    outline: fixSoft(base.outline, text),
    shadow: fixSoft(base.shadow, text),
    panel: base.panel,
    sun: swapBands(base.sun, shirt.hex, art),
    water: swapBands(base.water, shirt.hex, art),
  };
}

/** Distinct ink colors in a design, for the printer's order sheet. */
export function inkList(inks: Inks): string[] {
  return [...new Set([inks.text, inks.accent, inks.accent2, inks.art, ...inks.sun, ...inks.water, inks.panel])];
}
