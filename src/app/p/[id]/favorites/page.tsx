'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { otherName, useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { BackPreview } from '@/components/BackPreview';
import { useBackName } from '@/components/BackMeta';
import { Icon } from '@/components/Icon';
import { ComparePill, compareToggle } from '@/components/Compare';
import { ReactionButtons } from '@/components/Reactions';
import { toast } from '@/components/Toast';
import { useDesignArchive, useWho, When } from '@/components/ArchiveBits';
import { BottomBar, Button, LinkButton, PageTitle } from '@/components/ui';
import { compareHref, setCompare, useCompare } from '@/lib/client/compare';
import { backHref, designHref } from '@/lib/engine/paths';
import { useDesktop } from '@/lib/client/media';
import { usePrefs } from '@/lib/client/prefs';
import type { OptionRecord } from '@/lib/engine/types';
import type { ShirtOption } from '@/lib/server/studio';
import { allOfYou, heartBadge, sharedTitle } from '@/lib/engine/together';
import { Lovers } from '@/components/Lovers';

type Tab = 'both' | 'mine' | 'maybe' | 'theirs' | 'passed' | 'archived';
const TABS: Tab[] = ['both', 'mine', 'theirs', 'maybe', 'passed', 'archived'];

export default function FavoritesPage() {
  const { state, matches, myReaction, otherLoves, backs, referenceFront, wearer, lovers, members } = useProject();
  const backName = useBackName();
  const [prefs] = usePrefs();
  const other = otherName(state);
  const groups = useMemo(() => {
    const mine = state.options.filter((o) => myReaction(o.id) === 'love');
    return {
      both: matches,
      mine: [...mine].sort((a, b) => lovers(b.id).length - lovers(a.id).length),
      maybe: state.options.filter((o) => myReaction(o.id) === 'maybe'),
      theirs: state.options.filter((o) => otherLoves(o.id) && myReaction(o.id) !== 'love'),
      passed: state.options.filter((o) => myReaction(o.id) === 'pass'),
      archived: state.archived,
    };
  }, [state.options, state.archived, matches, myReaction, otherLoves, lovers]);
  const asked = useSearchParams().get('tab') as Tab | null;
  const firstTab: Tab =
    asked && TABS.includes(asked)
      ? asked
      : groups.both.length
        ? 'both'
        : groups.mine.length
          ? 'mine'
          : groups.theirs.length
            ? 'theirs'
            : groups.maybe.length
              ? 'maybe'
              : 'mine';
  const [tab, setTab] = useState<Tab>(firstTab);
  const tabRow = useRef<HTMLDivElement>(null);
  // Arriving on a tab off the end of the row (Archived, say) scrolls it into view; a visible one stays put.
  useEffect(() => {
    const row = tabRow.current;
    const on = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !on) return;
    const r = row.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    if (b.right > r.right) row.scrollLeft += b.right - r.right + 16;
    else if (b.left < r.left) row.scrollLeft -= r.left - b.left + 16;
  }, [tab]);
  const base = `/p/${state.project.id}`;
  const desktop = useDesktop();
  // On a phone there's no hovering, so comparing starts with a Select mode.
  const [selecting, setSelecting] = useState(false);
  const picked = useCompare(state.project.id);

  const allTabs: { id: Tab; label: string; n: number }[] = [
    { id: 'both', label: sharedTitle(members), n: groups.both.length },
    { id: 'mine', label: 'You love', n: groups.mine.length },
    { id: 'theirs', label: members <= 2 ? `${other} loves` : 'Others love', n: groups.theirs.length },
    { id: 'maybe', label: 'Maybe', n: groups.maybe.length },
    { id: 'passed', label: 'Passed', n: groups.passed.length },
    // Shared, unlike the rest: only there once something's been put away.
    ...(state.archived.length + state.archivedBacks.length || tab === 'archived'
      ? [{ id: 'archived' as Tab, label: 'Archived', n: state.archived.length + state.archivedBacks.length }]
      : []),
  ];
  // On your own there's nobody to share hearts with yet.
  const tabs = members > 1 ? allTabs : allTabs.filter((t) => t.id !== 'both' && t.id !== 'theirs');
  const list = groups[tab];
  const backList = tab === 'archived' ? state.archivedBacks : backs.filter((o) => {
    const m = myReaction(o.id);
    if (tab === 'both') return m === 'love' && otherLoves(o.id);
    if (tab === 'mine') return m === 'love';
    if (tab === 'theirs') return otherLoves(o.id) && m !== 'love';
    if (tab === 'passed') return m === 'pass';
    return m === 'maybe';
  });
  const front = referenceFront?.payload;

  return (
    <div className="animate-pop">
      <PageTitle
        title="Favorites"
        sub={
          members === 1
            ? groups.mine.length
              ? `${groups.mine.length} design${groups.mine.length === 1 ? '' : 's'} you love so far. Invite people from Household, and the ones you all love come first.`
              : 'Love designs in Browse and they collect here. Invite people from Household to decide together.'
            : members === 2
              ? groups.both.length
                ? `${groups.both.length} design${groups.both.length === 1 ? '' : 's'} you and ${other} both love. Those float to the top.`
                : `When you and ${other} both love a design, it shows up here first.`
              : groups.both.length
                ? `${groups.both.length} design${groups.both.length === 1 ? '' : 's'} you and others love, the most-loved first.`
                : 'When you and someone else love the same design, it shows up here first.'
        }
      />
      <div ref={tabRow} className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${tab === t.id ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${tab === t.id ? 'bg-white/20' : 'bg-sand-2'}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {!desktop && tab !== 'archived' && list.length >= 2 ? (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{selecting ? `Tap two to four to compare${picked.length ? ` · ${picked.length} picked` : ''}` : ''}</span>
          <button
            type="button"
            onClick={() => {
              if (selecting) setCompare(state.project.id, []);
              setSelecting(!selecting);
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 font-medium ring-1 ring-line"
          >
            <Icon name={selecting ? 'x' : 'grid'} size={15} /> {selecting ? 'Cancel' : 'Select to compare'}
          </button>
        </div>
      ) : null}

      {tab === 'passed' && (list.length || backList.length) ? (
        <p className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-muted ring-1 ring-line">
          Only you can see these. Open one and tap a heart or maybe to bring it back.
        </p>
      ) : null}
      {tab === 'archived' && (list.length || backList.length) ? (
        <p className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-muted ring-1 ring-line">
          Put away for {allOfYou(members)}, newest first. Restore one to bring it back to Browse and Favorites, hearts and all.
        </p>
      ) : null}

      {tab === 'archived' && list.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {list.map((o) => (
            <ArchivedCard key={o.id} o={o} href={designHref(base, o.id, 'favorites')}>
              <ShirtPreview design={o.payload} copy={o.payload.copyOverride ?? state.project.brief.copy} style={prefs.style} color={prefs.color} />
            </ArchivedCard>
          ))}
        </div>
      ) : list.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
          {list.map((o) => (
            <FavCard
              key={o.id}
              o={o}
              base={base}
              style={prefs.style}
              color={prefs.color}
              selecting={selecting && !desktop}
              badge={myReaction(o.id) === 'love' && otherLoves(o.id) ? heartBadge(lovers(o.id).length, members) : null}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-8 text-center text-muted shadow-[var(--shadow-card)]">
          {tab === 'theirs'
            ? `Nothing from ${other} you don't already love.`
            : tab === 'passed'
              ? 'You haven’t passed on anything.'
              : tab === 'archived'
                ? 'No archived fronts.'
                : 'Nothing here yet.'}
          <div className="mt-4">
            <LinkButton href={`${base}/browse`} icon="heart">
              Browse designs
            </LinkButton>
          </div>
        </div>
      )}

      {backList.length && front ? (
        <>
          <h2 className="mb-3 mt-7 font-display text-xl font-semibold">On the back</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5">
            {tab === 'archived'
              ? backList.map((o) => (
                  <ArchivedCard key={o.id} o={o} href={backHref(base, o.id, 'favorites')} name={backName(o)}>
                    <BackPreview back={o.payload} facts={state.facts} front={front} copy={front.copyOverride ?? state.project.brief.copy} style={prefs.style} color={prefs.color} wearer={wearer} label={backName(o)} />
                  </ArchivedCard>
                ))
              : backList.map((o) => (
              <Link key={o.id} href={backHref(base, o.id, 'favorites')} className="relative block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition active:scale-[0.98]">
                <div className="bg-sand-2/60 px-3 pt-3">
                  <BackPreview back={o.payload} facts={state.facts} front={front} copy={front.copyOverride ?? state.project.brief.copy} style={prefs.style} color={prefs.color} wearer={wearer} label={backName(o)} />
                </div>
                <div className="px-3 pb-3 pt-2 text-[13px] font-medium leading-tight">{backName(o)}</div>
              </Link>
                ))}
          </div>
        </>
      ) : null}

      {selecting && !desktop ? (
        <BottomBar>
          {picked.length >= 2 ? (
            <LinkButton href={compareHref(state.project.id, picked)} size="lg" className="w-full" icon="grid">
              Compare {picked.length}
            </LinkButton>
          ) : (
            <Button size="lg" className="w-full" icon="grid" disabled>
              Pick {picked.length ? 'one more' : 'two to compare'}
            </Button>
          )}
        </BottomBar>
      ) : state.canApprove && groups.both.length + groups.mine.length > 0 && state.project.status !== 'approved' ? (
        <BottomBar>
          <LinkButton href={`${base}/approve`} size="lg" className="w-full" icon="check">
            Pick the final
          </LinkButton>
        </BottomBar>
      ) : null}
      <ComparePill />
    </div>
  );
}

function FavCard({
  o,
  base,
  style,
  color,
  badge,
  selecting = false,
}: {
  o: ShirtOption;
  base: string;
  style: 'tee' | 'longsleeve' | 'hoodie';
  color: string;
  badge: string | null;
  selecting?: boolean;
}) {
  const { state, myReaction, react } = useProject();
  const desktop = useDesktop();
  const picked = useCompare(state.project.id).includes(o.id);
  if (selecting) {
    // Picking for a comparison on a phone: a tap picks it instead of opening it.
    return (
      <button
        type="button"
        onClick={() => compareToggle(state.project.id, o.id)}
        aria-pressed={picked}
        aria-label={picked ? 'Picked to compare' : 'Pick to compare'}
        className={`relative block w-full overflow-hidden rounded-3xl bg-white text-left shadow-[var(--shadow-card)] transition active:scale-[0.98] ${picked ? 'ring-[3px] ring-lagoon' : ''}`}
      >
        <div className="bg-sand-2/60 px-3 pt-3">
          <ShirtPreview design={o.payload} copy={o.payload.copyOverride ?? state.project.brief.copy} style={style} color={color} />
        </div>
        <span className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-[var(--shadow-card)] ${picked ? 'bg-lagoon text-white' : 'bg-white text-ink/40'}`}>
          <Icon name="check" size={16} />
        </span>
      </button>
    );
  }
  const card = (
    <Link href={designHref(base, o.id, 'favorites')} className="relative block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition active:scale-[0.98]">
      <div className="bg-sand-2/60 px-3 pt-3">
        <ShirtPreview design={o.payload} copy={o.payload.copyOverride ?? state.project.brief.copy} style={style} color={color} />
      </div>
      {/* One row that wraps, so "Everyone" and "Original" never sit on top of each other; on a laptop it stays clear of the compare button. */}
      <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1 lg:right-12">
        {badge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2 py-1 text-[11px] font-semibold text-white">
            <Icon name="heart" size={11} filled /> {badge}
          </span>
        ) : null}
        {o.source === 'seed' ? <span className="rounded-full bg-sun-soft px-2 py-1 text-[11px] font-semibold text-[#8a6410]">Original</span> : null}
      </div>
      <Lovers optionId={o.id} className="absolute bottom-2 left-2" />
    </Link>
  );
  if (!desktop) return card;

  // On a laptop, hovering shows the reactions and a way to pick it for comparing.
  const mine = myReaction(o.id);
  const hover = 'opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100';
  return (
    <div className="group relative">
      {card}
      <button
        onClick={() => compareToggle(state.project.id, o.id)}
        aria-pressed={picked}
        aria-label="Compare"
        title={picked ? 'Picked to compare' : 'Compare'}
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-[var(--shadow-card)] ${picked ? 'bg-lagoon text-white' : `bg-white text-ink/70 ${hover}`}`}
      >
        <Icon name={picked ? 'check' : 'grid'} size={15} />
      </button>
      <div className={`absolute inset-x-0 bottom-3 ${hover}`}>
        <ReactionButtons size="sm" value={mine} onReact={(v) => react(o.id, mine === v ? null : v).catch((e) => toast((e as Error).message, 'error'))} />
      </div>
    </div>
  );
}

/** An archived design: when it was made, when and by whom it was put away, and a way back. */
function ArchivedCard({ o, href, name, children }: { o: OptionRecord; href: string; name?: string; children: React.ReactNode }) {
  const who = useWho();
  const shelf = useDesignArchive(o.id);
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      <Link href={href} className="block bg-sand-2/60 px-3 pt-3 opacity-80 transition hover:opacity-100">
        {children}
      </Link>
      <div className="space-y-0.5 px-3 pb-3 pt-2 text-[12px] leading-snug text-muted">
        {name ? <p className="text-[13px] font-medium text-ink">{name}</p> : null}
        <p>
          Made <When iso={o.createdAt} />
        </p>
        <p>
          Archived <When iso={o.archived!.at} /> by {who(o.archived!.by)}
        </p>
        <Button variant="secondary" size="sm" icon="undo" className="mt-2 w-full" onClick={shelf.restore} busy={shelf.busy}>
          Restore
        </Button>
      </div>
    </div>
  );
}
