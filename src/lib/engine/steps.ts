// The four steps across the top of a project, and which ones you've done.
// Every step can be opened at any time: the checks show progress, they don't lock anything.
import type { ReactionValue } from './types';

export type StepId = 'browse' | 'favorites' | 'back' | 'final';

export interface StepState {
  done: boolean;
  /** A word under the step: "optional" for a back not picked yet, "plain" for an approved shirt with nothing on the back. */
  note?: 'optional' | 'plain';
}

export interface StepInput {
  /** Your reactions to the front designs (undefined: not looked at yet). */
  fronts: (ReactionValue | undefined)[];
  /** Your reactions to the backs. */
  backs: (ReactionValue | undefined)[];
  approved: boolean;
  /** Approved with nothing on the back. */
  plainBack: boolean;
}

/**
 * Browse is done once you've swiped anything, Favorites once you love a front,
 * the back once you love one (it's optional until then), and Final once it's
 * approved. An approved project has every step done: the choosing is over.
 */
export function stepProgress({ fronts, backs, approved, plainBack }: StepInput): Record<StepId, StepState> {
  const lovedBack = backs.includes('love');
  return {
    browse: { done: approved || fronts.some(Boolean) },
    favorites: { done: approved || fronts.includes('love') },
    back: approved ? { done: true, ...(plainBack ? { note: 'plain' as const } : {}) } : lovedBack ? { done: true } : { done: false, note: 'optional' },
    final: { done: approved },
  };
}
