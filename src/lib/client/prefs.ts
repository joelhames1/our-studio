'use client';
import { useCallback, useEffect, useState } from 'react';
import type { GarmentStyle } from '@/lib/design/types';

export interface Prefs {
  style: GarmentStyle;
  color: string;
  view: 'chest' | 'full' | 'art' | '3d';
  /** Which mannequin the 3D view uses; defaults to whoever is signed in. */
  fit?: 'erin' | 'joel';
  /** On a laptop, Browse one card at a time or as a grid. */
  browse?: 'cards' | 'grid';
}

/** The swipe deck and thumbnails can't host 3D; they use the close-up instead. */
export function flatView(v: Prefs['view']): 'chest' | 'full' | 'art' {
  return v === '3d' ? 'chest' : v;
}

const DEFAULTS: Prefs = { style: 'tee', color: 'white', view: 'chest' };
const KEY = 'studio.prefs.v1';

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<(p: Prefs) => void>();

/** How Erin likes to look at shirts (style, color, zoom), remembered on her phone. */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    setPrefs(read());
    listeners.add(setPrefs);
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    const next = { ...read(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private browsing: just keep it in memory.
    }
    listeners.forEach((l) => l(next));
  }, []);
  return [prefs, update];
}
