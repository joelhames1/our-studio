'use client';
import { useSyncExternalStore } from 'react';

/** Tailwind's `lg`: a laptop or bigger. */
export const DESKTOP = '(min-width: 1024px)';

function subscribe(changed: () => void): () => void {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', changed);
  return () => mq.removeEventListener('change', changed);
}

/**
 * True on a laptop-sized screen, for things phones shouldn't even build. False
 * while the page hydrates, so it matches the server's HTML; true straight after.
 */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}
