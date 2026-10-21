'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@/lib/engine/types';
import { http } from '@/lib/client/http';
import { onShortcut, SHORTCUTS_EVENT } from '@/lib/client/keys';
import { DESKTOP } from '@/lib/client/media';
import type { Shirt } from '@/lib/server/overview';
import type { ShirtOption, ShirtProject } from '@/lib/server/studio';
import { AgreeToAI } from './AgreeToAI';
import { Icon } from './Icon';
import { LegalLinks } from './Legal';
import { Sheet } from './Sheet';
import { ShirtPreview } from './ShirtPreview';

interface SidebarProject {
  id: string;
  title: string;
  status: ShirtProject['status'];
  unseen: number;
  theyLoved: number;
  pick: { design: ShirtOption['payload']; copy: ShirtProject['brief']['copy'] } | null;
  shirt: Shirt;
}

/** Pages that stand alone: signing in, the printer's page, the 3D lab. */
const BARE = [/^\/k(\/|$)/, /^\/s\//, /^\/lab\//];
/** Readable before you've agreed to how AI is used (the welcome screen links to them). */
const OPEN = [/^\/privacy$/, /^\/terms$/];

/**
 * On a laptop or bigger: a sidebar with every project, and keyboard
 * shortcuts. Below 1024px none of it shows, so phones are exactly as before.
 */
export function AppShell({ me, agreed, children }: { me: User; agreed: boolean; children: ReactNode }) {
  const path = usePathname();
  if (BARE.some((r) => r.test(path))) return <>{children}</>;
  if (!agreed && !OPEN.some((r) => r.test(path))) return <AgreeToAI me={me} />;
  return (
    <>
      <Sidebar me={me} path={path} />
      <div className="lg:pl-64">{children}</div>
      <ShortcutsHelp />
    </>
  );
}

function Sidebar({ me, path }: { me: User; path: string }) {
  const [projects, setProjects] = useState<SidebarProject[] | null>(null);
  const [archived, setArchived] = useState(0);

  // Only fetched when the sidebar can be seen, and again on every page change so counts stay current.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    let live = true;
    const load = () => {
      if (!mq.matches) return;
      http<{ projects: SidebarProject[]; archived: number }>('/api/projects')
        .then((r) => {
          if (!live) return;
          setProjects(r.projects);
          setArchived(r.archived);
        })
        .catch(() => undefined);
    };
    load();
    mq.addEventListener('change', load);
    return () => {
      live = false;
      mq.removeEventListener('change', load);
    };
  }, [path]);

  const item = 'flex items-center gap-3 rounded-2xl px-2.5 py-2 text-[15px] transition hover:bg-white/70';
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line/70 bg-sand-2/50 px-3 pb-4 pt-5 lg:flex">
      <Link prefetch={false} href="/" className="flex items-center gap-2.5 px-2.5">
        <img src="/icon.svg" alt="" className="h-8 w-8 rounded-xl" />
        <span className="font-display text-lg font-semibold">Our Studio</span>
      </Link>

      <nav aria-label="Projects" className="-mx-1 mt-7 flex-1 overflow-y-auto px-1">
        <div className="px-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Projects</div>
        <ul className="mt-2 space-y-0.5">
          {(projects ?? []).map((p) => {
            const approved = p.status === 'approved';
            const active = path === `/p/${p.id}` || path.startsWith(`/p/${p.id}/`);
            return (
              <li key={p.id}>
                <Link
                  prefetch={false}
                  href={approved ? `/p/${p.id}/done` : `/p/${p.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`${item} ${active ? 'bg-white shadow-[var(--shadow-card)]' : ''}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center overflow-hidden rounded-xl bg-white ring-1 ring-line/70">
                    {p.pick ? <ShirtPreview design={p.pick.design} copy={p.pick.copy} style={p.shirt.style} color={p.shirt.color} view="art" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {approved ? 'Approved' : p.unseen ? `${p.unseen} new` : 'All caught up'}
                      {!approved && p.theyLoved ? ` · ${p.theyLoved} to catch up on` : ''}
                    </span>
                  </span>
                  {!approved && p.unseen ? (
                    <span className="rounded-full bg-lagoon-soft px-1.5 text-[11px] leading-[18px] text-lagoon-deep">{p.unseen}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          {projects === null ? <li className="px-2.5 py-2 text-sm text-muted">Loading…</li> : null}
        </ul>
        <Link prefetch={false} href="/new" aria-current={path === '/new' ? 'page' : undefined} className={`${item} mt-2 text-lagoon-deep`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line">
            <Icon name="plus" size={20} />
          </span>
          <span className="font-medium">Start something new</span>
        </Link>
      </nav>

      <div className="space-y-0.5 border-t border-line/70 pt-3">
        {archived ? (
          <Link prefetch={false} href="/archived" aria-current={path === '/archived' ? 'page' : undefined} className={`${item} text-ink/75 ${path === '/archived' ? 'bg-white' : ''}`}>
            <Icon name="archive" size={18} />
            <span className="flex-1">Archived</span>
            <span className="text-xs text-muted">{archived}</span>
          </Link>
        ) : null}
        <Link prefetch={false} href="/activity" aria-current={path === '/activity' ? 'page' : undefined} className={`${item} text-ink/75 ${path === '/activity' ? 'bg-white' : ''}`}>
          <Icon name="clock" size={18} />
          <span className="flex-1">Activity</span>
        </Link>
        <Link prefetch={false} href="/household" aria-current={path === '/household' ? 'page' : undefined} className={`${item} text-ink/75 ${path === '/household' ? 'bg-white' : ''}`}>
          <Icon name="users" size={18} />
          <span className="flex-1">Household</span>
        </Link>
        <Link prefetch={false} href="/how-it-works" aria-current={path === '/how-it-works' ? 'page' : undefined} className={`${item} text-ink/75 ${path === '/how-it-works' ? 'bg-white' : ''}`}>
          <Icon name="info" size={18} />
          <span className="flex-1">How it works</span>
        </Link>
        <button onClick={() => window.dispatchEvent(new Event(SHORTCUTS_EVENT))} className={`${item} w-full text-ink/75`}>
          <Icon name="keyboard" size={18} />
          <span className="flex-1 text-left">Keyboard shortcuts</span>
          <kbd className="rounded-md bg-white px-1.5 text-xs text-muted ring-1 ring-line">?</kbd>
        </button>
        {me.admin ? (
          <Link prefetch={false} href="/admin" aria-current={path === '/admin' ? 'page' : undefined} className={`${item} text-ink/75`}>
            <Icon name="settings" size={18} /> Setup
          </Link>
        ) : null}
        <form action="/api/logout" method="post" className="flex items-baseline gap-1.5 px-2.5 pt-2 text-xs text-muted">
          Signed in as{' '}
          <Link prefetch={false} href="/account" className="underline-offset-4 hover:text-ink hover:underline" aria-current={path === '/account' ? 'page' : undefined}>
            {me.name}
          </Link>{' '}
          ·
          <button className="underline-offset-4 hover:text-ink hover:underline">Sign out</button>
        </form>
        <LegalLinks home={false} className="px-2.5 pt-1" />
      </div>
    </aside>
  );
}

const KEYS: [string, [string[], string][]][] = [
  [
    'Browsing one at a time',
    [
      [['→', 'L'], 'Love it'],
      [['↓', 'M'], 'Maybe'],
      [['←', 'P'], 'Pass'],
      [['Z'], 'Undo the last one'],
      [['Enter'], 'Look closer'],
    ],
  ],
  [
    'Browsing as a grid',
    [
      [['←', '→', '↑', '↓'], 'Move around'],
      [['L', 'M', 'P'], 'Love, maybe, pass'],
      [['Enter'], 'Open it'],
      [['Z'], 'Undo the last one'],
    ],
  ],
  [
    'Anywhere',
    [
      [['?'], 'Show these shortcuts'],
      [['Esc'], 'Close a panel'],
    ],
  ],
];

/** The list of shortcuts, from the sidebar or by pressing "?". */
function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHORTCUTS_EVENT, show);
    const off = onShortcut((e) => {
      if (e.key !== '?') return false;
      show();
      return true;
    });
    return () => {
      window.removeEventListener(SHORTCUTS_EVENT, show);
      off();
    };
  }, []);
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <div className="space-y-5 pb-6">
        {KEYS.map(([group, keys]) => (
          <section key={group}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{group}</h3>
            <ul className="divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-[var(--shadow-card)]">
              {keys.map(([k, what]) => (
                <li key={what} className="flex items-center justify-between py-2.5">
                  <span>{what}</span>
                  <span className="flex gap-1">
                    {k.map((key) => (
                      <kbd key={key} className="min-w-7 rounded-lg bg-sand px-2 py-0.5 text-center text-sm font-medium ring-1 ring-line">
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
