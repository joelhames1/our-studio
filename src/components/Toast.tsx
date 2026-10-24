'use client';
import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; tone: 'info' | 'error' };
const listeners = new Set<(t: Toast) => void>();
let n = 0;

export function toast(text: string, tone: Toast['tone'] = 'info') {
  const t = { id: ++n, text, tone };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (t: Toast) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3200);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    // On a phone, just under the project's header: the bottom of the screen is where the buttons are.
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--header-h,7rem)+0.5rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-10 lg:top-auto lg:pl-64"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`animate-pop rounded-full px-4 py-2.5 text-[15px] font-medium shadow-[var(--shadow-lift)] ${t.tone === 'error' ? 'bg-coral text-white' : 'bg-ink text-white'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
