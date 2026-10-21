'use client';
// The last few swipes on Browse, kept for this browser tab so Undo still works
// after you pop over to another screen and come back.
import type { ReactionValue } from '@/lib/engine/types';

export interface Swipe {
  id: string;
  value: ReactionValue;
}

export const MAX_SWIPES = 10;
const key = (projectId: string) => `studio:swipes:${projectId}`;
const VALUES = new Set<unknown>(['love', 'maybe', 'pass']);

export function loadSwipes(projectId: string): Swipe[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key(projectId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is Swipe => !!s && typeof s.id === 'string' && VALUES.has(s.value))
      .slice(-MAX_SWIPES);
  } catch {
    return [];
  }
}

export function saveSwipes(projectId: string, swipes: Swipe[]) {
  try {
    sessionStorage.setItem(key(projectId), JSON.stringify(swipes.slice(-MAX_SWIPES)));
  } catch {
    // Private browsing or storage switched off: Undo just won't outlive this screen.
  }
}
