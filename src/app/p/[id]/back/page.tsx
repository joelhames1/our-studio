'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { BackPreview } from '@/components/BackPreview';
import { backName } from '@/components/BackMeta';
import { FactsSheet } from '@/components/FactsSheet';
import { Icon } from '@/components/Icon';
import { otherName, useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { toast } from '@/components/Toast';
import { Button, PageTitle } from '@/components/ui';
import { usePrefs } from '@/lib/client/prefs';
import type { BackTemplateId } from '@/lib/design/back/types';
import type { BackOption } from '@/lib/server/studio';
import { heartBadge, listNames, sharedCount } from '@/lib/engine/together';

const FILTERS: { id: string; label: string; templates?: BackTemplateId[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'hearts', label: 'Hearted' },
  { id: 'travel', label: 'Travel', templates: ['flight-path', 'tour-dates', 'coordinates'] },
  { id: 'milestones', label: 'Milestones', templates: ['numbers', 'timeline', 'established'] },
  { id: 'people', label: 'People', templates: ['jersey', 'crew'] },
  { id: 'simple', label: 'Simple', templates: ['statement', 'established'] },
];

export default function BackPage() {
  const { state, backs, backMatches, referenceFront, myReaction, otherLoves, react, remixBacks, wearer, lovers, members } = useProject();
  const [prefs] = usePrefs();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/p/${state.project.id}`;
  const other = otherName(state);
  const front = referenceFront?.payload;
  const copy = referenceFront?.payload.copyOverride ?? state.project.brief.copy;

  // Keep cards where they were while you're on the page (hearting one shouldn't
  // make the grid jump); new ideas go at the end.
  const order = useRef<string[]>([]);
  for (const o of backs) if (!order.current.includes(o.id)) order.current.push(o.id);
  const filtered = useMemo(() => {
    const pos = (id: string) => order.current.indexOf(id);
    const all = [...backs].sort((a, b) => pos(a.id) - pos(b.id));
    return Object.fromEntries(
      FILTERS.map((f) => {
        if (f.id === 'hearts') return [f.id, all.filter((o) => myReaction(o.id) === 'love' || otherLoves(o.id))];
        if (f.id === 'simple') return [f.id, all.filter((o) => f.templates!.includes(o.payload.template) || o.payload.size === 'neck')];
        return [f.id, f.templates ? all.filter((o) => f.templates!.includes(o.payload.template)) : all];
      }),
    ) as Record<string, BackOption[]>;
  }, [backs, myReaction, otherLoves]);
  const list = filtered[filter] ?? filtered.all;
  // Only offer filters that have something in them (All and Hearted always show).
  const chips = FILTERS.filter((f) => f.id === 'all' || f.id === 'hearts' || filtered[f.id].length);

  const more = async () => {
    setBusy(true);
    try {
      const created = await remixBacks({ count: 6 });
      toast(`${created.length} new back ideas, at the bottom`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const heart = (o: BackOption) => react(o.id, myReaction(o.id) === 'love' ? null : 'love').catch((e) => toast((e as Error).message, 'error'));

  return (
    <div className="animate-pop">
      <PageTitle
        kicker="Step 4"
        title="The back"
        sub={
          backMatches.length
            ? members <= 2
              ? `${backMatches.length} back${backMatches.length === 1 ? '' : 's'} you and ${other} both love, up top.`
              : `${sharedCount(backMatches.length, members)}, up top.`
            : 'Something for the back, or nothing at all. Heart the ones you like.'
        }
      />

      {referenceFront && front ? (
        <div className="mb-4 flex items-center gap-3 rounded-3xl bg-white p-3 shadow-[var(--shadow-card)]">
          <div className="w-16 shrink-0 overflow-hidden rounded-2xl bg-sand-2/60 px-1 pt-1">
            <ShirtPreview design={front} copy={copy} style={prefs.style} color={prefs.color} />
          </div>
          <p className="min-w-0 flex-1 text-sm text-muted">
            Backs match the fonts and colors of the front you&apos;re leaning toward. Pick a different front and they follow.
          </p>
        </div>
      ) : null}

      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {chips.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium ${filter === f.id ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {list.map((o) => {
            const mine = myReaction(o.id);
            const both = mine === 'love' && otherLoves(o.id);
            const badge = heartBadge(lovers(o.id).length, members);
            return (
              <div key={o.id} className={`relative overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] ${mine === 'pass' ? 'opacity-55' : ''}`}>
                <Link href={`${base}/b/${o.id}`} className="block transition active:scale-[0.98]" aria-label={backName(o)}>
                  <div className="bg-sand-2/60 px-3 pt-3">
                    {front ? (
                      <BackPreview back={o.payload} facts={state.facts} front={front} copy={copy} style={prefs.style} color={prefs.color} wearer={wearer} label={backName(o)} />
                    ) : null}
                  </div>
                  <div className="px-3 pb-3 pt-2 pr-12 text-[13px] font-medium leading-tight">{backName(o)}</div>
                </Link>
                <button
                  onClick={() => heart(o)}
                  aria-label={mine === 'love' ? `Unheart ${backName(o)}` : `Heart ${backName(o)}`}
                  aria-pressed={mine === 'love'}
                  className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full shadow-[var(--shadow-card)] transition active:scale-90 ${mine === 'love' ? 'bg-coral text-white' : 'bg-white text-coral'}`}
                >
                  <Icon name="heart" size={18} filled={mine === 'love'} />
                </button>
                {both ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-coral px-2 py-1 text-[11px] font-semibold text-white">
                    <Icon name="heart" size={11} filled /> {badge}
                  </span>
                ) : otherLoves(o.id) ? (
                  <span className="absolute left-2 top-2 rounded-full bg-coral-soft px-2 py-1 text-[11px] font-semibold text-coral">{members <= 2 ? other : listNames(lovers(o.id).map((m) => m.name))} ♥</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-8 text-center text-muted shadow-[var(--shadow-card)]">Nothing here yet.</div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2 lg:mx-auto lg:max-w-lg">
        <Button variant="secondary" icon="sparkles" onClick={more} busy={busy}>
          More back ideas
        </Button>
        <Button variant="secondary" icon="type" onClick={() => setEditing(true)}>
          Edit the details
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">The route, names, numbers and dates live in the details. Change them once and every back updates.</p>

      <FactsSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
