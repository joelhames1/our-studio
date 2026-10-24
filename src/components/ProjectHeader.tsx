'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import { originOf, tabFor, upFrom } from '@/lib/engine/paths';
import { stepProgress, type StepId } from '@/lib/engine/steps';
import { compareHref, useCompare } from '@/lib/client/compare';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';

type Step = { id: StepId; href: string; label: string; badge: number; done: boolean };

/**
 * The project's name, and its four steps in order: numbered, joined by a line,
 * ticked as you do them. Any step can be opened at any time.
 */
export function ProjectHeader() {
  const { state, deck, matches, backMatches, myReaction, members } = useProject();
  const uid = useId();
  const header = useRef<HTMLElement>(null);
  // Toasts sit just under the header on a phone, however tall the steps make it.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const root = document.documentElement.style;
    const watch = new ResizeObserver(() => root.setProperty('--header-h', `${el.offsetHeight}px`));
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.removeProperty('--header-h');
    };
  }, []);
  const path = usePathname();
  const from = originOf(useSearchParams().get('from'));
  const base = `/p/${state.project.id}`;
  const approved = state.project.status === 'approved';
  const current = tabFor(path, base, from);
  const comparing = useCompare(state.project.id);
  const up = upFrom(path, base, from, approved);
  // Back to the same comparison, not an empty one.
  if (from === 'compare' && comparing.length >= 2 && up.href.endsWith('/compare')) up.href = compareHref(state.project.id, comparing);
  const progress = stepProgress({
    fronts: state.options.map((o) => myReaction(o.id)),
    backs: state.backs.map((o) => myReaction(o.id)),
    approved,
    plainBack: approved && !state.decision?.snapshot.back,
  });
  const steps: Step[] = [
    // Once it's approved, what's left to browse doesn't need anyone's attention.
    { id: 'browse', href: `${base}/browse`, label: 'Browse', badge: approved ? 0 : deck.length, done: progress.browse.done },
    { id: 'favorites', href: `${base}/favorites`, label: 'Favorites', badge: matches.length + backMatches.length, done: progress.favorites.done },
    { id: 'back', href: `${base}/back`, label: 'Back print', badge: 0, done: progress.back.done },
    { id: 'final', href: approved ? `${base}/done` : `${base}/approve`, label: approved ? 'Done' : 'Final', badge: 0, done: progress.final.done },
  ];
  const describe = (i: number, done: boolean, note: string | undefined, t: Step) =>
    [
      `Step ${i + 1} of ${steps.length}`,
      done ? 'done' : note,
      t.badge ? (t.id === 'browse' ? `${t.badge} to look at` : `${t.badge} ${members > 2 ? 'loved by you and others' : 'you both love'}`) : null,
    ]
      .filter(Boolean)
      .join(', ');
  // A line runs through the dots on a phone; on a laptop the steps sit in a row joined by short lines.
  const joined = (on: boolean) => (on ? 'bg-lagoon' : 'bg-line');
  return (
    <header ref={header} className="sticky top-0 z-30 border-b border-line/70 bg-sand/90 backdrop-blur-md">
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
      <nav className="mx-auto max-w-xl px-3 pb-2 pt-1.5 sm:px-5 lg:max-w-6xl lg:px-8 lg:pb-3 lg:pt-2.5" aria-label="Project steps">
        <ol className="grid grid-cols-4 lg:flex lg:items-center">
          {steps.map((t, i) => {
            const here = current === t.id;
            const { done, note } = progress[t.id];
            return (
              <li key={t.id} className="relative flex justify-center lg:items-center">
                {i > 0 ? <span aria-hidden className={`absolute left-0 right-1/2 top-[13px] h-0.5 lg:hidden ${joined(steps[i - 1].done)}`} /> : null}
                {i < steps.length - 1 ? <span aria-hidden className={`absolute left-1/2 right-0 top-[13px] h-0.5 lg:hidden ${joined(done)}`} /> : null}
                <Link
                  href={t.href}
                  aria-current={here ? 'page' : undefined}
                  aria-describedby={`${uid}-${t.id}`}
                  className={`group relative flex flex-col items-center text-center lg:flex-row lg:gap-2.5 lg:text-left ${
                    here ? 'font-semibold text-ink' : done ? 'font-medium text-ink' : 'font-medium text-ink/60 hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition ${
                      done
                        ? 'bg-lagoon text-white'
                        : here
                          ? 'bg-ink text-white'
                          : note === 'optional'
                            ? 'border-[1.5px] border-dashed border-ink/25 bg-white text-ink/60'
                            : 'border-[1.5px] border-line bg-white text-ink/60 group-hover:border-ink/30'
                    } ${here ? 'ring-2 ring-ink ring-offset-2 ring-offset-sand' : ''}`}
                  >
                    {done ? <Icon name="check" size={14} /> : i + 1}
                    {t.badge > 0 ? (
                      <span
                        className={`absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] ${
                          t.id === 'favorites' ? 'bg-coral text-white' : 'bg-lagoon-soft text-lagoon-deep'
                        }`}
                      >
                        {t.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 whitespace-nowrap text-[13px] leading-4 lg:mt-0 lg:text-sm lg:leading-5">{t.label}</span>
                  {note ? (
                    <span aria-hidden className="text-[11px] font-normal leading-[14px] text-muted lg:-ml-1 lg:text-xs">
                      <span className="hidden lg:inline">· </span>
                      {note}
                    </span>
                  ) : null}
                </Link>
                {/* Outside the link, so it describes the step without becoming part of its name. */}
                <span id={`${uid}-${t.id}`} className="sr-only">
                  {describe(i, done, note, t)}
                </span>
                {i < steps.length - 1 ? <span aria-hidden className={`mx-3 hidden h-0.5 w-12 lg:block ${joined(done)}`} /> : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
