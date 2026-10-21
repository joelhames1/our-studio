/**
 * Control characters, and the invisible marks that flip which way text runs
 * ("Sam", U+202E, "nimdA" shows as "SamAdmin"): never part of a name, title or
 * label anyone typed on purpose.
 */
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Typed text as one tidy line: hidden characters gone, runs of spaces made one, cut to `max`. Anything that isn't text is ''. */
export const oneLine = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
