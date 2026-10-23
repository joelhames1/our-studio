import type { BackKit, Composed } from '../kit';
import type { BackSize, BackTemplateId, FactKey, Occasion } from '../types';

export interface BackTemplate {
  id: BackTemplateId;
  name: string;
  /** What it's called on particular occasions ("Class of" on a graduation), when the plain name doesn't fit. */
  names?: Partial<Record<Occasion, string>>;
  blurb: string;
  /** Occasions this template suits; drives what's suggested first. */
  occasions: Occasion[];
  /** Which details it prints, so the details form can say what matters. */
  uses: FactKey[];
  variants: { id: string; name: string }[];
  /** Sizes that make sense; the first is the default. */
  sizes: BackSize[];
  /** Each shirt gets its wearer's own name (one print file per name). */
  personal?: boolean;
  build: (k: BackKit) => Composed;
}
