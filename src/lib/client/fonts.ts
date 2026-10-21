'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { preload } from 'react-dom';
import { parse, type Font } from 'opentype.js';
import fontList from '@/lib/design/fonts.json';
import versions from '@/lib/design/font-versions.json';
import type { FontSet } from '@/lib/design/types';

// The shirt fonts, loaded as screens need them. A preview names the fonts its
// design draws with (lib/design/fontsFor.ts): those are preloaded from the
// server's HTML, read first, and the preview shows as soon as they're ready.
// The rest follow once the page is idle, so the next design's are there too.
// Reading a font is the slow part on a phone, so nobody waits for all 22.

/** Each font's address carries a hash of the file, so the browser keeps it for a year (next.config.ts) and still notices a new one. */
const fontUrl = (id: string) => `/fonts/${id}.woff?v=${(versions as Record<string, string>)[id] ?? '0'}`;
const ALL = fontList.map((f) => f.id);

const parsed = new Map<string, Font>();
const loading = new Map<string, Promise<void>>();
/** Everything read so far. Replaced, never changed, so a screen re-renders only when something it waits for arrives. */
let current: FontSet = {};
/** The set each list of fonts was first ready in. */
const ready = new Map<string, FontSet>();
const waiting = new Set<() => void>();

function load(id: string): Promise<void> {
  let got = loading.get(id);
  if (!got) {
    got = fetch(fontUrl(id))
      .then((res) => {
        if (!res.ok) throw new Error(`Font ${id} failed to load`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        parsed.set(id, parse(buf));
      });
    // A failed or canceled download is asked for again next time.
    got.catch(() => loading.delete(id));
    loading.set(id, got);
  }
  return got;
}

function publish() {
  current = Object.fromEntries(parsed);
  waiting.forEach((done) => done());
}

/** Fonts asked for in one go (a page full of previews) are read together, then shown together. */
let asked = new Set<string>();
let flushing = false;
function need(ids: readonly string[]) {
  for (const id of ids) if (!parsed.has(id)) asked.add(id);
  if (!asked.size || flushing) return;
  flushing = true;
  queueMicrotask(() => {
    const batch = [...asked];
    asked = new Set();
    flushing = false;
    Promise.all(batch.map(load)).then(publish, () => undefined).finally(restWhenIdle);
  });
}

let resting = false;
/** The fonts nothing on screen needs yet, once the page has nothing better to do. */
function restWhenIdle() {
  if (resting || parsed.size === ALL.length) return;
  resting = true;
  const go = () =>
    Promise.all(ALL.map(load)).then(publish, () => {
      resting = false;
    });
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}

/** Every shirt font, read (the 3D try-on and the lab draw with any of them). */
export function loadFonts(): Promise<FontSet> {
  return Promise.all(ALL.map(load)).then(() => {
    publish();
    return current;
  });
}

function subscribe(done: () => void): () => void {
  waiting.add(done);
  return () => waiting.delete(done);
}

/**
 * The fonts, once the ones in `ids` are read (all of them if no list is
 * given), or null while they load. While a page is hydrating this is null
 * even if they're already here, so it matches the server's HTML; it switches
 * straight after. Later screens that need the same fonts get them at once.
 */
export function useFonts(ids: readonly string[] = ALL): FontSet | null {
  const key = ids.join(' ');
  // Ask for the files from the server's HTML too, so they're on their way before any script runs.
  for (const id of ids) preload(fontUrl(id), { as: 'fetch', crossOrigin: 'anonymous' });
  if (typeof window !== 'undefined') need(ids);
  const snapshot = useCallback(() => {
    const hit = ready.get(key);
    if (hit) return hit;
    if (!key.split(' ').every((id) => id in current)) return null;
    // From now on this list gets this same set, so fonts arriving later for other screens don't redraw this one.
    ready.set(key, current);
    return current;
  }, [key]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
