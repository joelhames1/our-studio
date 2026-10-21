'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';

export function ProjectHeader() {
  const { state, deck, matches, backMatches } = useProject();
  const path = usePathname();
  const base = `/p/${state.project.id}`;
  const nav = useRef<HTMLElement>(null);
  // On narrow phones the tabs scroll sideways; keep the current one in sight.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav.current && el) nav.current.scrollLeft = el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2;
  }, [path]);
  const steps = [
    { href: `${base}/vibe`, label: 'Vibe', badge: 0 },
    { href: `${base}/words`, label: 'Words', badge: 0 },
    { href: `${base}/browse`, label: 'Browse', badge: deck.length },
    { href: `${base}/back`, label: 'Back', badge: 0 },
    { href: `${base}/favorites`, label: 'Favorites', badge: matches.length + backMatches.length },
    { href: state.project.status === 'approved' ? `${base}/done` : `${base}/approve`, label: state.project.status === 'approved' ? 'Done' : 'Approve', badge: 0 },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-sand/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 lg:max-w-6xl lg:px-8 lg:pt-3">
        <Link href="/" aria-label="Home" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink/5 lg:hidden">
          <Icon name="chevronLeft" />
        </Link>
        <Link href={base} className="font-display text-[19px] font-semibold">
          {state.project.title}
        </Link>
        <span className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-medium text-muted ring-1 ring-line lg:hidden">{state.me.name}</span>
      </div>
      <nav
        ref={nav}
        className="mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-3 pb-2.5 pt-2 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] sm:px-5 sm:pr-10 lg:max-w-6xl lg:px-8 lg:pb-3 lg:[mask-image:none]"
        aria-label="Steps"
      >
        {steps.map((s) => {
          const active = path === s.href || (s.label === 'Browse' && path.startsWith(`${base}/o/`)) || (s.label === 'Back' && path.startsWith(`${base}/b/`)) || (s.label === 'Favorites' && path.startsWith(`${base}/compare`));
          return (
            <Link
              key={s.label}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition ${
                active ? 'bg-ink text-white' : 'bg-white text-ink/75 ring-1 ring-line hover:text-ink'
              }`}
            >
              {s.label}
              {s.badge > 0 ? (
                <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${active ? 'bg-white/20' : s.label === 'Favorites' ? 'bg-coral text-white' : 'bg-lagoon-soft text-lagoon-deep'}`}>
                  {s.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
