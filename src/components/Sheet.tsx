'use client';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * A bottom sheet: the most thumb-friendly way to show a few extra controls.
 * On a laptop it's a panel down the right-hand side, so the page stays in view.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  // Portalled to <body> so it sits above the sticky header, whatever the page's
  // own stacking (animated pages create their own).
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] lg:bg-ink/15 lg:backdrop-blur-none" onClick={onClose} aria-label="Close" />
      <div className="sheet-panel safe-bottom animate-pop relative max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[28px] bg-sand px-5 pt-3 shadow-[var(--shadow-lift)] lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-[28px] lg:px-6 lg:pt-6">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15 lg:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
