'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { otherName, useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { ReactionButtons } from '@/components/Reactions';
import { DesignBadges, describeDesign } from '@/components/DesignMeta';
import { GarmentPicker } from '@/components/GarmentPicker';
import { toast } from '@/components/Toast';
import { Button, LinkButton, PageTitle } from '@/components/ui';
import { compareHref, MAX_COMPARE, setCompare } from '@/lib/client/compare';
import { flatView, usePrefs } from '@/lib/client/prefs';
import type { ShirtOption } from '@/lib/server/studio';
import { listNames } from '@/lib/engine/together';

const VIEWS = [
  { id: 'chest', label: 'Close-up' },
  { id: 'full', label: 'Shirt' },
  { id: 'art', label: 'Art' },
] as const;

const COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

export default function ComparePage() {
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}

/** Who's hearted it so far, and who hasn't (yet), in a household of more than two. A pass looks the same as not yet. */
function HeartRoll({ loved, everyone, me }: { loved: { id: string; name: string }[]; everyone: { id: string; name: string }[]; me: string }) {
  const yet = everyone.filter((m) => m.id !== me && !loved.some((l) => l.id === m.id)).map((m) => m.name);
  return (
    <div className="mt-2 space-y-1.5 text-sm text-muted">
      {loved.length ? (
        <div className="flex items-center gap-2">
          <span className="flex -space-x-1.5" aria-hidden>
            {loved.slice(0, 5).map((m) => (
              <span key={m.id} className="flex h-6 w-6 items-center justify-center rounded-full bg-coral text-[11px] font-semibold text-white ring-2 ring-white">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </span>
          <span>Loved by {listNames(loved.map((m) => (m.id === me ? 'you' : m.name)))}</span>
        </div>
      ) : null}
      {yet.length ? <p>Not hearted yet: {listNames(yet)}</p> : null}
    </div>
  );
}

/** Two to four designs side by side, all on the same shirt, with everyone's hearts. */
function Compare() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, option, myReaction, otherLoves, react, lovers, members } = useProject();
  const [prefs, setPrefs] = usePrefs();
  const pid = state.project.id;
  const base = `/p/${pid}`;
  const ids = [...new Set((params.get('ids') ?? '').split(',').filter(Boolean))];
  const designs = ids.map((id) => option(id)).filter((o): o is ShirtOption => !!o).slice(0, MAX_COMPARE);
  const shown = designs.map((o) => o.id).join(',');
  const view = flatView(prefs.view);
  const other = otherName(state);

  // What's on screen is what's picked, so Favorites carries on from here.
  useEffect(() => {
    if (shown) setCompare(pid, shown.split(','));
  }, [pid, shown]);

  const remove = (id: string) => {
    const rest = designs.filter((o) => o.id !== id).map((o) => o.id);
    setCompare(pid, rest);
    router.replace(rest.length >= 2 ? compareHref(pid, rest) : `${base}/favorites`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast(`Link copied. Send it to ${other} to compare the same ones.`);
    } catch {
      toast('Couldn’t copy. Copy the address from the browser instead.', 'error');
    }
  };

  if (designs.length < 2) {
    return (
      <div className="animate-pop pt-6 text-center">
        <PageTitle title="Pick a few to compare" sub="Choose two to four designs in Favorites, then compare them side by side." />
        <LinkButton href={`${base}/favorites`} icon="star">
          Go to Favorites
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="animate-pop">
      <PageTitle kicker="Compare" title={`${designs.length} side by side`} sub="All on the same shirt, so you're comparing like with like." />

      <div className="mb-5 space-y-3 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
        <div className="flex gap-1.5 rounded-full bg-sand-2 p-1 lg:w-80" role="radiogroup" aria-label="Zoom">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setPrefs({ view: v.id })}
              className={`h-9 flex-1 rounded-full text-sm font-medium transition ${view === v.id ? 'bg-white shadow-sm' : 'text-ink/60'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="rounded-3xl bg-white p-3 shadow-[var(--shadow-card)] lg:flex-1">
          <GarmentPicker style={prefs.style} color={prefs.color} onChange={(p) => setPrefs(p)} compact />
        </div>
        <Button variant="secondary" icon="copy" onClick={copyLink} className="w-full lg:w-auto">
          Copy link
        </Button>
      </div>

      <div className={`-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:gap-5 lg:overflow-visible lg:px-0 ${COLS[designs.length]}`}>
        {designs.map((o) => {
          const mine = myReaction(o.id);
          return (
            <article key={o.id} className="w-[calc(50%-6px)] shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] lg:w-auto">
              <Link href={`${base}/o/${o.id}`} className="block bg-sand-2/60 px-3 pt-3" aria-label={`Look closer: ${describeDesign(o)}`}>
                <ShirtPreview design={o.payload} copy={o.payload.copyOverride ?? state.project.brief.copy} style={prefs.style} color={prefs.color} view={view} />
              </Link>
              <div className="p-3 lg:p-4">
                <DesignBadges option={o} />
                <p className="mt-1.5 text-[13px] leading-snug text-muted">{describeDesign(o)}</p>
                {/* The badges already say when they love it; say when they haven't. */}
                {members <= 2 ? (
                  otherLoves(o.id) ? null : <p className="mt-2 text-sm text-muted">{other} hasn&apos;t hearted it yet</p>
                ) : (
                  <HeartRoll loved={lovers(o.id)} everyone={state.members} me={state.me.id} />
                )}
                <div className="mt-3">
                  <ReactionButtons size="sm" value={mine} onReact={(v) => react(o.id, mine === v ? null : v).catch((e) => toast((e as Error).message, 'error'))} />
                </div>
                {state.canApprove && state.project.status !== 'approved' ? (
                  <LinkButton href={`${base}/approve?option=${o.id}`} size="sm" icon="check" className="mt-3 w-full">
                    Choose this
                  </LinkButton>
                ) : null}
                <button onClick={() => remove(o.id)} className="mt-2 w-full py-1 text-sm text-muted underline underline-offset-4">
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
