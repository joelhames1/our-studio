'use client';
import { useSyncExternalStore } from 'react';
import { parse } from 'opentype.js';
import fontList from '@/lib/design/fonts.json';
import versions from '@/lib/design/font-versions.json';
import type { FontSet } from '@/lib/design/types';

let loaded: FontSet | null = null;
let loading: Promise<FontSet> | null = null;
const waiting = new Set<() => void>();

/** Each font's address carries a hash of the file, so the browser keeps it for a year (next.config.ts) and still notices a new one. */
const fontUrl = (id: string) => `/fonts/${id}.woff?v=${(versions as Record<string, string>)[id] ?? '0'}`;

/** The font files themselves, each asked for once. */
const files = new Map<string, Promise<ArrayBuffer>>();
function file(id: string): Promise<ArrayBuffer> {
  let got = files.get(id);
  if (!got) {
    got = fetch(fontUrl(id)).then((res) => {
      if (!res.ok) throw new Error(`Font ${id} failed to load`);
      return res.arrayBuffer();
    });
    // A failed or canceled download is asked for again next time.
    got.catch(() => files.delete(id));
    files.set(id, got);
  }
  return got;
}

// Start downloading as soon as this code arrives, not when the first preview mounts: about 200 ms sooner on a
// phone. Reading them (the slow part on a phone's CPU) still waits until a preview needs them.
if (typeof window !== 'undefined') for (const f of fontList) file(f.id).catch(() => undefined);

/** Fetches and parses every shirt font once (about 460 KB, cached by the browser). */
export function loadFonts(): Promise<FontSet> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = Promise.all(fontList.map(async (f) => [f.id, parse(await file(f.id))] as const)).then((pairs) => {
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
