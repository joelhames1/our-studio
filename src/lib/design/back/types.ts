// The back of the shirt. Backs are built from templates (flight path, tour
// dates, by the numbers…) that all draw from one shared set of "details", the
// same way every front design shares the project's words.
import type { PartColors } from '../types';

export type Occasion = 'trip' | 'anniversary' | 'birthday' | 'graduation' | 'reunion' | 'team' | 'everyday';

export interface Stop {
  /** Airport or short code, e.g. "LAX". Optional for road trips. */
  code: string;
  /** "San Francisco" */
  place: string;
  /** State or country, e.g. "CA" or "Portugal". */
  region: string;
  /** When you get there, e.g. "Jun 3". */
  date: string;
  /** A real stop (hotel, a night or more) rather than a plane change. */
  stay: boolean;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Moment {
  year: string;
  label: string;
}

export interface Place {
  name: string;
  lat: number | null;
  lng: number | null;
  /** Shown in the details form until someone confirms the numbers. */
  unchecked?: boolean;
}

/** Everything a back template might print. Filled in once per project. */
export interface Facts {
  /** "The “Un”iversary Tour" */
  title: string;
  people: string[];
  /** "Jun 2 – 9, 2027" */
  dates: string;
  /** A year worth printing: wedding year, birth year, graduation year. */
  year: string;
  /** What goes in front of the year: "Est.", "Vintage", "Class of". */
  yearLabel: string;
  /** The jersey number. */
  bigNumber: string;
  statement: string;
  signature: string;
  stops: Stop[];
  stats: Stat[];
  timeline: Moment[];
  place: Place;
}

export type BackTemplateId =
  | 'flight-path'
  | 'tour-dates'
  | 'numbers'
  | 'timeline'
  | 'crew'
  | 'jersey'
  | 'established'
  | 'coordinates'
  | 'statement';

/** A big back print (about 12 in wide) or a small one under the collar. */
export type BackSize = 'full' | 'neck';

/** One back option. */
export interface BackDesign {
  template: BackTemplateId;
  variant: string;
  size: BackSize;
  /** Unset means "match the front". */
  pairing?: string;
  palette?: string;
  /** The front's picked word colors, copied in when the back is frozen at approval. */
  colors?: PartColors;
}

/** Facts a template uses; drives which parts of the details form matter. */
export type FactKey = keyof Facts;
