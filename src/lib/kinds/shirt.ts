// The shirt kind: what a shirt project's brief, options and approvals contain.
import type { BackDesign, Facts, Occasion } from '@/lib/design/back/types';
import type { Copy, GarmentStyle, ShirtDesign } from '@/lib/design/types';

/** Option kinds in a shirt project: front designs and back designs. */
export const FRONT = 'shirt';
export const BACK = 'shirt-back';

export interface ShirtBrief {
  copy: Copy;
  vibes: string[];
  ticket: { from: string; to: string; date: string; seats?: string };
  /** Word ideas offered on the Words step (seeded, plus Claude's). */
  copyIdeas: Copy[];
  /** The ZIP code the printer finder last searched. */
  printZip?: string;
  /** What's being celebrated; steers which back templates come first. */
  occasions?: Occasion[];
  /** The details the back templates print (route, numbers, timeline…). */
  facts?: Facts;
  /** A few sentences about the occasion, for Claude when it writes or art-directs. */
  context?: string;
  /** Subjects for AI artwork when Claude isn't there to come up with its own (else the occasions' own). */
  artIdeas?: string[];
  /** Art styles to paint in when nobody's picked a vibe (else the occasions' own). */
  artVibes?: string[];
}

/** The back, frozen at approval. */
export interface BackSnapshot {
  optionId: string;
  /** With "match the front" resolved to real fonts and colors. */
  design: BackDesign;
  facts: Facts;
  widthIn: number;
  /** For templates that print each wearer's name: one print file per name. */
  names: string[];
}

export interface SizeLine {
  who: string;
  size: string;
  qty: number;
}

/** Everything locked in at approval time. */
export interface ShirtSnapshot {
  design: ShirtDesign;
  copy: Copy;
  garment: GarmentStyle;
  color: string;
  preset: string;
  sizes: SizeLine[];
  notes: string;
  /** Null or missing: nothing on the back. */
  back?: BackSnapshot | null;
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

/**
 * Who gets a shirt, to start with: the people the project is about, then
 * everyone in the household, once each (just you if there's nobody else).
 */
export function startingSizes(people: string[], household: string[], me: string): SizeLine[] {
  const seen = new Set<string>();
  const names = [...people, ...household].map((p) => p.trim()).filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
  return (names.length ? names : [me]).slice(0, 12).map((who) => ({ who, size: 'M', qty: 1 }));
}
