import type { Pairing } from './types';

export const PAIRINGS: Pairing[] = [
  {
    id: 'bebas-pacifico',
    name: 'Tall & Breezy',
    headline: { font: 'bebas', upper: true, tracking: 0.02, lineHeight: 0.92 },
    tagline: { font: 'pacifico', upper: false, lineHeight: 1.2 },
    extra: { font: 'montserrat-bold', upper: true, tracking: 0.3 },
    emphasisFont: 'pacifico',
    defaultEmphasis: 'script',
  },
  {
    id: 'anton-yellowtail',
    name: 'Bold & Signed',
    headline: { font: 'anton', upper: true, tracking: 0.01, lineHeight: 0.98 },
    tagline: { font: 'yellowtail', upper: false, lineHeight: 1.15 },
    extra: { font: 'oswald', upper: true, tracking: 0.3 },
    emphasisFont: 'yellowtail',
    defaultEmphasis: 'script',
  },
  {
    id: 'abril-josefin',
    name: 'Elegant Poster',
    headline: { font: 'abril', upper: false, lineHeight: 1.0 },
    tagline: { font: 'josefin', upper: true, tracking: 0.18 },
    extra: { font: 'josefin', upper: true, tracking: 0.3 },
    emphasisFont: 'abril',
    defaultEmphasis: 'color',
  },
  {
    id: 'alfa-lobster',
    name: 'Slab & Script',
    headline: { font: 'alfaslab', upper: true, tracking: 0.02, lineHeight: 1.0 },
    tagline: { font: 'lobster', upper: false, lineHeight: 1.15 },
    extra: { font: 'montserrat-bold', upper: true, tracking: 0.3 },
    emphasisFont: 'lobster',
    defaultEmphasis: 'script',
  },
  {
    id: 'playfair-montserrat',
    name: 'Classic Serif',
    headline: { font: 'playfair', upper: false, lineHeight: 1.02 },
    tagline: { font: 'montserrat', upper: true, tracking: 0.2 },
    extra: { font: 'montserrat', upper: true, tracking: 0.35 },
    emphasisFont: 'playfair-italic',
    defaultEmphasis: 'script',
  },
  {
    id: 'righteous-caveat',
    name: 'Retro Fun',
    headline: { font: 'righteous', upper: true, tracking: 0.03, lineHeight: 1.0 },
    tagline: { font: 'caveat', upper: false, lineHeight: 1.1 },
    extra: { font: 'righteous', upper: true, tracking: 0.25 },
    emphasisFont: 'caveat',
    defaultEmphasis: 'color',
  },
  {
    id: 'shrikhand-fredoka',
    name: 'Bubbly',
    headline: { font: 'shrikhand', upper: false, lineHeight: 1.05 },
    tagline: { font: 'fredoka', upper: false },
    extra: { font: 'fredoka', upper: true, tracking: 0.2 },
    emphasisFont: 'shrikhand',
    defaultEmphasis: 'color',
  },
  {
    id: 'spacemono',
    name: 'Typewriter',
    headline: { font: 'spacemono-bold', upper: true, tracking: 0, lineHeight: 1.05 },
    tagline: { font: 'caveat', upper: false },
    extra: { font: 'spacemono', upper: true, tracking: 0.2 },
    emphasisFont: 'spacemono-bold',
    defaultEmphasis: 'color',
  },
  {
    id: 'oswald-pacifico',
    name: 'Surf Shop',
    headline: { font: 'oswald', upper: true, tracking: 0.04, lineHeight: 0.98 },
    tagline: { font: 'pacifico', upper: false, lineHeight: 1.2 },
    extra: { font: 'oswald', upper: true, tracking: 0.35 },
    emphasisFont: 'pacifico',
    defaultEmphasis: 'script',
  },
  {
    id: 'dmserif-caveat',
    name: 'Soft Serif',
    headline: { font: 'dmserif', upper: false, lineHeight: 1.0 },
    tagline: { font: 'caveat', upper: false },
    extra: { font: 'montserrat', upper: true, tracking: 0.3 },
    emphasisFont: 'dmserif-italic',
    defaultEmphasis: 'script',
  },
  {
    id: 'rubik-montserrat',
    name: 'Chunky Mono',
    headline: { font: 'rubikmono', upper: true, tracking: 0, lineHeight: 1.08 },
    tagline: { font: 'montserrat-bold', upper: true, tracking: 0.12 },
    extra: { font: 'montserrat', upper: true, tracking: 0.35 },
    emphasisFont: 'rubikmono',
    defaultEmphasis: 'color',
  },
  {
    id: 'lobster-oswald',
    name: 'Diner Script',
    headline: { font: 'lobster', upper: false, lineHeight: 1.05 },
    tagline: { font: 'oswald', upper: true, tracking: 0.2 },
    extra: { font: 'oswald', upper: true, tracking: 0.35 },
    emphasisFont: 'lobster',
    defaultEmphasis: 'color',
  },
];

export function pairing(id: string): Pairing {
  return PAIRINGS.find((p) => p.id === id) ?? PAIRINGS[0];
}

/** Every font a design might need, for preloading. */
export function fontsForPairing(id: string): string[] {
  const p = pairing(id);
  return [...new Set([p.headline.font, p.tagline.font, p.extra.font, p.emphasisFont, 'montserrat'])];
}
