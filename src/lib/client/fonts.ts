'use client';
import { useSyncExternalStore } from 'react';
import { parse } from 'opentype.js';
import fontList from '@/lib/design/fonts.json';
import type { FontSet } from '@/lib/design/types';

let loaded: FontSet | null = null;
let loading: Promise<FontSet> | null = null;
const waiting = new Set<() => void>();

/** Fetches and parses every shirt font once (about 600 KB, cached by the browser). */
export function loadFonts(): Promise<FontSet> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = Promise.all(
      fontList.map(async (f) => {
        const res = await fetch(`/fonts/${f.id}.woff`);
        if (!res.ok) throw new Error(`Font ${f.id} failed to load`);
        return [f.id, parse(await res.arrayBuffer())] as const;
      }),
    ).then((pairs) => {
      loaded = Object.fromEntries(pairs);
      waiting.forEach((done) => done());
      return loaded;
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}

function subscribe(done: () => void): () => void {
  waiting.add(done);
  // A failed or canceled download (leaving the page mid-load) is tried again by the next preview.
  if (!loaded) loadFonts().catch(() => undefined);
  return () => waiting.delete(done);
}

/**
 * The fonts, or null while they load. While a page is hydrating this is null
 * even if another part of the page has already loaded them, so it matches the
 * server's HTML; it switches straight after. On later pages it's immediate.
 */
export function useFonts(): FontSet | null {
  return useSyncExternalStore(
    subscribe,
    () => loaded,
    () => null,
  );
}
