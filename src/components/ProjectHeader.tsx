'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { originOf, tabFor, upFrom, type Origin } from '@/lib/engine/paths';
import { compareHref, useCompare } from '@/lib/client/compare';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';

export function ProjectHeader() {
  const { state, deck, matches, backMatches } = useProject();
  const path = usePathname();
  const from = originOf(useSearchParams().get('from'));
  const base = `/p/${state.project.id}`;
  const approved = state.project.status === 'approved';
  const nav = useRef<HTMLElement>(null);
  // On narrow phones the tabs can scroll sideways; keep the current one in sight.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav.current && el) nav.current.scrollLeft = el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2;
  }, [path]);
  const current = tabFor(path, base, from);
  const comparing = useCompare(state.project.id);
  const up = upFrom(path, base, from, approved);
  // Back to the same comparison, not an empty one.
  if (from === 'compare' && comparing.length >= 2 && up.href.endsWith('/compare')) up.href = compareHref(state.project.id, comparing);
  const tabs: { id: Origin; href: string; label: string; badge: number }[] = [
    // Once it's approved, what's left to browse doesn't need anyone's attention.
    { id: 'browse', href: `${base}/browse`, label: 'Browse', badge: approved ? 0 : deck.length },
    { id: 'favorites', href: `${base}/favorites`, label: 'Favorites', badge: matches.length + backMatches.length },
    { id: 'back', href: `${base}/back`, label: 'Back print', badge: 0 },
    { id: 'final', href: approved ? `${base}/done` : `${base}/approve`, label: approved ? 'Done' : 'Final', badge: 0 },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-sand/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 lg:max-w-6xl lg:px-8 lg:pt-3">
        <Link href={up.href} aria-label={up.label} title={up.label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-ink/5 lg:hidden">
          <Icon name="chevronLeft" />
        </Link>
        <Link href={base} className="min-w-0 truncate font-display text-[19px] font-semibold">
          {state.project.title}
        </Link>
        <Link
          href="/account"
          className="ml-auto shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-muted ring-1 ring-line hover:text-ink lg:hidden"
          aria-label={`You: ${state.me.name}`}
        >
          {state.me.name}
        </Link>
      </div>
      <nav
        ref={nav}
        className="mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-3 pb-2.5 pt-2 [scrollbar-width:none] sm:px-5 lg:max-w-6xl lg:px-8 lg:pb-3"
        aria-label="Project"
      >
        {tabs.map((t) => {
          const active = current === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition ${
                active ? 'bg-ink text-white' : 'bg-white text-ink/75 ring-1 ring-line hover:text-ink'
              }`}
            >
              {t.label}
              {t.badge > 0 ? (
                <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${active ? 'bg-white/20' : t.id === 'favorites' ? 'bg-coral text-white' : 'bg-lagoon-soft text-lagoon-deep'}`}>
                  {t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
