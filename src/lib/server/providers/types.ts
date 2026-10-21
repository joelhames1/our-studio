import type { MotifId } from '@/lib/design/types';

export interface ArtRequest {
  prompt: string;
  /** For the vector provider, which draws from a subject rather than a long prompt. */
  subject?: string;
  styles?: string[];
  colors?: string[];
  /** Built-in drawings that suit the project (the practice artist paints from these). */
  motifs?: MotifId[];
  /** When the painting has to be done by (ms since 1970): each service fits its calls inside it, so the request ends with an answer rather than being cut off. */
  deadline?: number;
}

/** How long a service may take on its next call: what's left before the deadline, at most `cap`, and never so little it can't try. */
export const timeLeft = (req: Pick<ArtRequest, 'deadline'>, cap: number) => Math.max(5_000, Math.min(cap, (req.deadline ?? Infinity) - Date.now()));

export interface ArtResult {
  data: Buffer;
  type: 'png' | 'svg';
  /** What this cost, in dollars, if known. */
  usd: number;
}

/** Anything that can paint shirt artwork. Swap providers with IMAGE_PROVIDER. */
export interface ImageProvider {
  id: string;
  label: string;
  model: string;
  /** Rough cost of one image, for the budget guard. */
  estimateUsd: number;
  generate(req: ArtRequest): Promise<ArtResult>;
  /** AI upscaling for print (optional). */
  upscale?(png: Buffer): Promise<Buffer>;
  /** Background removal for providers without native transparency (optional). */
  removeBackground?(png: Buffer, timeoutMs?: number): Promise<Buffer>;
  /** Cheap call to confirm the key works. */
  ping(): Promise<string>;
}

/** Wording added to every prompt so the art comes back print-ready. */
export const PRINT_RULES =
  'Isolated illustration for a T-shirt print, centered, on a fully transparent background, no border, no frame, no shadow on the ground. Flat, solid colors with crisp edges. Absolutely no text, letters, numbers, words, signatures or watermarks anywhere.';
