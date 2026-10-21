'use client';
// The designs picked to compare, kept for this tab so the picking can happen
// across Favorites and a design's own page. The comparison itself lives in the
// address (/compare?ids=...), so it can be sent to the other person.
import { useSyncExternalStore } from 'react';

export const MAX_COMPARE = 4;
const NONE: string[] = [];
const picked = new Map<string, string[]>();
const listeners = new Set<() => void>();
const key = (projectId: string) => `studio:compare:${projectId}`;

function current(projectId: string): string[] {
  if (!picked.has(projectId)) {
    let ids = NONE;
    try {
      ids = JSON.parse(sessionStorage.getItem(key(projectId)) ?? '[]');
    } catch {
      // Private browsing: start empty.
    }
    picked.set(projectId, Array.isArray(ids) ? ids : NONE);
  }
  return picked.get(projectId)!;
}

export function setCompare(projectId: string, ids: string[]) {
  const next = [...new Set(ids)].slice(0, MAX_COMPARE);
  picked.set(projectId, next);
  try {
    sessionStorage.setItem(key(projectId), JSON.stringify(next));
  } catch {
    // Kept in memory instead.
  }
  listeners.forEach((l) => l());
}

/** Adds or removes one. False when it's already full. */
export function toggleCompare(projectId: string, id: string): boolean {
  const ids = current(projectId);
  if (ids.includes(id)) setCompare(projectId, ids.filter((x) => x !== id));
  else if (ids.length >= MAX_COMPARE) return false;
  else setCompare(projectId, [...ids, id]);
  return true;
}

function subscribe(changed: () => void): () => void {
  listeners.add(changed);
  return () => listeners.delete(changed);
}

/** What's picked. Empty while the page hydrates, so it matches the server. */
export function useCompare(projectId: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => current(projectId),
    () => NONE,
  );
}

export const compareHref = (projectId: string, ids: string[]) => `/p/${projectId}/compare?ids=${ids.join(',')}`;
