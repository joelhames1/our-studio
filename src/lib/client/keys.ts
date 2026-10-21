'use client';
// Keyboard shortcuts for laptops. They stay out of the way of typing, open
// panels and controls that use the same keys themselves.

/** Fired to open the list of keyboard shortcuts. */
export const SHORTCUTS_EVENT = 'studio:shortcuts';

/** True when a key press belongs to something else: a text field, an open panel, a focused control. */
function forSomethingElse(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return true;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  if ((e.key === 'Enter' || e.key === ' ') && t?.closest('a, button, summary')) return true;
  if (e.key.startsWith('Arrow') && t?.closest('[role="radiogroup"], [role="tablist"], [role="slider"], canvas')) return true;
  return !!document.querySelector('[role="dialog"]');
}

/** Listens for page shortcuts. The handler returns true when it used the key. */
export function onShortcut(handler: (e: KeyboardEvent) => boolean): () => void {
  const listener = (e: KeyboardEvent) => {
    if (forSomethingElse(e)) return;
    if (handler(e)) e.preventDefault();
  };
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}
