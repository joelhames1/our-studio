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
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-10 lg:pl-64" aria-live="polite">
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
