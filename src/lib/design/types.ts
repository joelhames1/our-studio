import type { Font } from 'opentype.js';

/** The words on the shirt. Shared by every design unless a design overrides them. */
export interface Copy {
  headline: string;
  tagline: string;
  /** Small supporting line, e.g. "Lisbon · 2027". Optional. */
  extra: string;
}

export type FontId = string;
export type FontSet = Record<FontId, Font>;

export type LayoutId =
  | 'stack'
  | 'badge'
  | 'arch'
  | 'bigtype'
  | 'ticket'
  | 'stamp'
  | 'minimal'
  | 'poster';

export type MotifId =
  | 'none'
  | 'sunset-palm'
  | 'sunset-clock'
  | 'hourglass-island'
  | 'bungalow-sunset'
  | 'plane-sun'
  | 'clock'
  | 'palm-duo'
  | 'sun-rays'
  | 'sunset'
  | 'balloons'
  | 'cake'
  | 'grad-cap'
  | 'laurel'
  | 'hearts'
  | 'champagne'
  | 'confetti';

/** Where the artwork comes from. Built-in vector motifs need no AI at all. */
export type ArtRef =
  | { kind: 'motif'; motif: MotifId; line?: boolean }
  | {
      kind: 'image';
      /** Storage key of a transparent PNG. */
      assetKey: string;
      width: number;
      height: number;
      prompt?: string;
      provider?: string;
    }
  | { kind: 'svg'; assetKey: string; prompt?: string }
  | { kind: 'none' };

export type Emphasis = 'color' | 'script' | 'none';

/** The bits of lettering that can have a color of their own. */
export type ColorPart = 'headline' | 'emphasis' | 'tagline' | 'extra' | 'outline' | 'shadow';
/** "#RRGGBB" per part. A part left out takes the color scheme's ink. */
export type PartColors = Partial<Record<ColorPart, string>>;

/** One design option: everything needed to render it except the words and shirt. */
export interface ShirtDesign {
  layout: LayoutId;
  pairing: string;
  palette: string;
  art: ArtRef;
  emphasis?: Emphasis;
  /** Hard drop shadow behind the headline. */
  shadow?: boolean;
  /** Outline around the headline. */
  outline?: boolean;
  /** Relative size tweaks, 1 = default. */
  headlineScale?: number;
  taglineScale?: number;
  artScale?: number;
  /** Colors picked for particular words. They stay put whatever the scheme or shirt. */
  colors?: PartColors;
  /** Words just for this design (from "change the words for this one"). */
  copyOverride?: Copy;
  /** Trip facts used by the boarding-pass layout. Seats default to two. */
  ticket?: { from: string; to: string; date: string; seats?: string };
}

export type GarmentStyle = 'tee' | 'longsleeve' | 'hoodie';
export type GarmentSide = 'front' | 'back';
export type Tone = 'light' | 'dark';

export interface GarmentColor {
  id: string;
  name: string;
  hex: string;
  tone: Tone;
}

/** Inks for one shirt tone. */
export interface Inks {
  text: string;
  accent: string;
  accent2: string;
  /** Sun bands, top to bottom. */
  sun: string[];
  /** Water bands, top to bottom. */
  water: string[];
  /** Silhouettes (palms, planes, hands). */
  art: string;
  outline: string;
  shadow: string;
  /** Solid panel fill (poster sky, ticket body). */
  panel: string;
}

export interface Palette {
  id: string;
  name: string;
  light: Inks;
  dark: Inks;
}

export interface TextRole {
  font: FontId;
  upper: boolean;
  /** Letter spacing in em. */
  tracking?: number;
  /** Baseline-to-baseline distance in em. */
  lineHeight?: number;
}

export interface Pairing {
  id: string;
  name: string;
  headline: TextRole;
  tagline: TextRole;
  extra: TextRole;
  /** Font for the quoted, emphasized bit (e.g. the “Un”). */
  emphasisFont: FontId;
  defaultEmphasis: Emphasis;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderContext {
  fonts: FontSet;
  copy: Copy;
  tone: Tone;
  /** Shirt color, used to keep inks readable. */
  shirtHex: string;
  /** Turns an asset key into something an <image href> can load. */
  assetHref: (key: string) => string;
}

/** The design canvas: 5:6, same shape as the 4500 x 5400 print master. */
export const CANVAS = { w: 1500, h: 1800 } as const;
