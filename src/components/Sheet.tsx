'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/*
 * An open sheet is an entry in the browser's history, so a phone's back button
 * (or a laptop's) closes the sheet instead of leaving the page. Closing it any
 * other way takes the entry back off again.
 */
type SheetEntry = { studioSheet?: string } | null;
const ours = (id: string) => (window.history.state as SheetEntry)?.studioSheet === id;
/** Set while a sheet hands over to another page, so its own entry is replaced rather than taken back. */
let handingOver = false;

/** What a router needs for leaveSheet: Next's useRouter() fits. */
type Router = { push: (href: string) => void; replace: (href: string) => void };

/**
 * Goes to another page from inside a sheet (a new version, say). The sheet's
 * history entry becomes that page, so Back from there returns to the page the
 * sheet was on, not to the sheet's own entry.
 */
export function leaveSheet(router: Router, href: string) {
  if ((window.history.state as SheetEntry)?.studioSheet) {
    handingOver = true;
    router.replace(href);
  } else {
    router.push(href);
  }
}

/**
 * A bottom sheet: the most thumb-friendly way to show a few extra controls.
 * On a laptop it's a panel down the right-hand side, so the page stays in view.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId();
  const pushed = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Opened: add the entry (once, however often this runs).
    if (!ours(id)) window.history.pushState({ studioSheet: id }, '');
    pushed.current = true;
    // Back was pressed: the entry's gone, so close.
    const onPop = () => {
      if (pushed.current && !ours(id)) {
        pushed.current = false;
        close.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, id]);

  useEffect(() => {
    if (open || !pushed.current) return;
    // Closed some other way (the X, the backdrop, Esc, Done): take the entry off,
    // unless the sheet is handing over to another page, which replaces it.
    pushed.current = false;
    if (handingOver) {
      handingOver = false;
      return;
    }
    if (ours(id)) window.history.back();
  }, [open, id]);

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
