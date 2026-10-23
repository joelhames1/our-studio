// Where people go next: back to the page they asked for after signing in, and
// back to where they came from after opening a design.

/** The app's own pages that a sign-in may send someone back to. */
const RETURNABLE = /^\/(p\/[a-z0-9-]+(\/[a-z0-9/-]*)?|new|household|account|activity|archived|how-it-works|admin(\/[a-z-]+)?)(\?[a-z0-9=&%_.-]*)?$/i;

/**
 * A page to return to after signing in, or null. Only a path on this site, one
 * of the app's own pages, and nothing that could leave it ("//elsewhere",
 * "/\elsewhere", a full address): what comes back from the address bar can't
 * be trusted.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return RETURNABLE.test(raw) ? raw : null;
}

/** The screens a design's own page can be opened from, to find the way back. */
export const ORIGINS = ['browse', 'favorites', 'compare', 'back', 'final'] as const;
export type Origin = (typeof ORIGINS)[number];

export function originOf(raw: unknown): Origin | null {
  return typeof raw === 'string' && (ORIGINS as readonly string[]).includes(raw) ? (raw as Origin) : null;
}

/** A design's page, remembering which screen it was opened from. */
export function designHref(base: string, id: string, from?: Origin | null): string {
  return `${base}/o/${id}${from ? `?from=${from}` : ''}`;
}

/** A back design's page, remembering which screen it was opened from. */
export function backHref(base: string, id: string, from?: Origin | null): string {
  return `${base}/b/${id}${from ? `?from=${from}` : ''}`;
}

/** The list a design was opened from: where "back" goes, and what it's called. */
export function returnTo(base: string, from: Origin | null, approved: boolean): { href: string; label: string; button: string } {
  switch (from) {
    case 'favorites':
      return { href: `${base}/favorites`, label: 'Favorites', button: 'Back to favorites' };
    case 'compare':
      return { href: `${base}/compare`, label: 'Comparison', button: 'Back to the comparison' };
    case 'final':
      return { href: `${base}/${approved ? 'done' : 'approve'}`, label: 'Final', button: 'Back to the final' };
    default:
      return { href: `${base}/browse`, label: 'Browse', button: 'Keep browsing' };
  }
}

/** Which tab a page belongs to. A design's own page belongs to the screen it was opened from. */
export function tabFor(path: string, base: string, from: Origin | null): Origin | null {
  const rest = path.slice(base.length);
  if (rest.startsWith('/o/')) return from === 'compare' ? 'favorites' : from === 'back' ? 'back' : (from ?? 'browse');
  if (rest.startsWith('/b/')) return from === 'favorites' || from === 'final' ? from : 'back';
  if (rest === '/browse' || rest === '/vibe') return 'browse';
  if (rest === '/favorites' || rest === '/compare') return 'favorites';
  if (rest === '/back') return 'back';
  if (rest === '/approve' || rest === '/done') return 'final';
  return null;
}

/** Where the arrow in the corner goes: a design back to its list, any other page to the project, the project to Home. */
export function upFrom(path: string, base: string, from: Origin | null, approved: boolean): { href: string; label: string } {
  const rest = path.slice(base.length);
  if (!rest || rest === '/') return { href: '/', label: 'Home' };
  if (rest.startsWith('/o/') || rest.startsWith('/b/')) {
    const tab = tabFor(path, base, from);
    if (tab === 'favorites') return { href: `${base}/${from === 'compare' ? 'compare' : 'favorites'}`, label: from === 'compare' ? 'Back to the comparison' : 'Back to favorites' };
    if (tab === 'final') return { href: `${base}/${approved ? 'done' : 'approve'}`, label: 'Back to the final' };
    if (tab === 'back') return { href: `${base}/back`, label: 'Back to the back prints' };
    return { href: `${base}/browse`, label: 'Back to browsing' };
  }
  return { href: base, label: 'Back to the project' };
}
