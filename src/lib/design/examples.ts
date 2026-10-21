// Example text for placeholders and quick buttons, drawn from the project's own
// occasion, so a graduation is never asked about palm trees.
import type { Occasion } from './back/types';
import { motifsFor, preset } from './occasions';
import type { MotifId } from './types';

/** An "Add …" request the keyword reader understands, per drawing. */
const ADD: Partial<Record<MotifId, string>> = {
  'sunset-palm': 'Add a palm tree',
  'palm-duo': 'Add two palms',
  'bungalow-sunset': 'Add a villa',
  'plane-sun': 'Add a plane',
  'hourglass-island': 'Add an hourglass',
  clock: 'Add a clock',
  balloons: 'Add balloons',
  cake: 'Add a cake',
  'grad-cap': 'Add a grad cap',
  laurel: 'Add a laurel wreath',
  hearts: 'Add hearts',
  champagne: 'Add a champagne toast',
  confetti: 'Add confetti',
  'sun-rays': 'Add a sunburst',
};

/** Suits anything, so only used when nothing more particular fits. */
const GENERIC = new Set<MotifId>(['none', 'sunset', 'sun-rays']);

/** A quick "Add …" artwork request that suits this kind of project. */
export function addArtRequest(occasions: Occasion[]): string {
  const motifs = motifsFor(occasions);
  const pick = motifs.find((m) => !GENERIC.has(m) && ADD[m]) ?? motifs.find((m) => ADD[m]);
  return (pick && ADD[pick]) ?? 'Add a sunburst';
}

/** A few subjects to suggest for brand-new artwork. */
export function artIdeaExamples(occasions: Occasion[], n = 2): string[] {
  const list: Occasion[] = occasions.length ? occasions : ['everyday'];
  return [...new Set(list.flatMap((o) => preset(o).artIdeas))].slice(0, n);
}
