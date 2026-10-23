'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { TryOn3D } from '@/components/TryOn3D';
import { ReactionButtons } from '@/components/Reactions';
import { DesignBadges, describeDesign } from '@/components/DesignMeta';
import { GarmentPicker } from '@/components/GarmentPicker';
import { TweakSheet } from '@/components/TweakSheet';
import { ColorsSheet } from '@/components/ColorsSheet';
import { ArchivedNote, useDesignArchive } from '@/components/ArchiveBits';
import { NewArtButton } from '@/components/NewArtButton';
import { CompareButton, ComparePill } from '@/components/Compare';
import { Icon } from '@/components/Icon';
import { leaveSheet, Sheet } from '@/components/Sheet';
import { Button, BUTTON_PAIRS, LinkButton } from '@/components/ui';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import { compareHref, useCompare } from '@/lib/client/compare';
import { designHref, originOf, returnTo } from '@/lib/engine/paths';
import type { Copy, ShirtDesign } from '@/lib/design/types';
import type { ShirtOption } from '@/lib/server/studio';
import { fitFor } from '@/lib/three/body';

const VIEWS = [
  { id: 'chest', label: 'Close-up' },
  { id: 'full', label: 'Shirt' },
  { id: '3d', label: '3D' },
  { id: 'art', label: 'Art' },
] as const;

export default function OptionPage() {
  const { optionId } = useParams<{ optionId: string }>();
  const from = originOf(useSearchParams().get('from'));
  const { state, anyOption, myReaction, react, remix, addVersion, members } = useProject();
  const [prefs, setPrefs] = usePrefs();
  const router = useRouter();
  const [tweaking, setTweaking] = useState(false);
  const [wording, setWording] = useState(false);
  const [coloring, setColoring] = useState(false);
  // The colors being tried in the Colors panel, shown on the big preview until saved.
  const [draft, setDraft] = useState<ShirtDesign | null>(null);
  const [busy, setBusy] = useState(false);
  const o = anyOption(optionId);
  const shelf = useDesignArchive(optionId);
  const base = `/p/${state.project.id}`;
  const comparing = useCompare(state.project.id);
  const back = returnTo(base, from, state.project.status === 'approved');
  // Back to the same comparison, not an empty one.
  if (from === 'compare' && comparing.length >= 2) back.href = compareHref(state.project.id, comparing);

  if (!o) {
    return (
      <div className="pt-10 text-center text-muted">
        That design isn&apos;t here anymore.
        <div className="mt-4">
          <LinkButton href={back.href}>{back.button}</LinkButton>
        </div>
      </div>
    );
  }
  const copy = o.payload.copyOverride ?? state.project.brief.copy;
  const mine = myReaction(o.id);
  // The design on the approved shirt stays out until the project is reopened.
  const chosen = state.project.status === 'approved' && state.decision?.optionId === o.id;
  const shown = draft ?? o.payload;

  // A new version opens in place of this one, still remembering where you came from.
  const goTo = (n: ShirtOption) => leaveSheet(router, designHref(base, n.id, from));

  const moreLike = async () => {
    setBusy(true);
    try {
      const created = await remix(o.id, 4);
      toast(`${created.length} variations added to Browse`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-pop lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start lg:gap-10">
      <div className="lg:sticky lg:top-32">
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> {back.label}
        </Link>
        <div className="mb-3 flex gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Zoom">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={prefs.view === v.id}
              onClick={() => setPrefs({ view: v.id })}
              className={`h-9 flex-1 rounded-full text-sm font-medium transition ${prefs.view === v.id ? 'bg-white shadow-sm' : 'text-ink/60'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[28px] bg-gradient-to-b from-sand-2/60 to-white px-4 pt-4 shadow-[var(--shadow-lift)]">
          {prefs.view === '3d' ? (
            <div className="pb-1">
              <TryOn3D
                design={shown}
                copy={copy}
                style={prefs.style}
                color={prefs.color}
                widthIn={prefs.style === 'hoodie' ? 10 : 12}
                placement="center"
                fit={prefs.fit ?? fitFor(state.me.id)}
                onFitChange={(fit) => setPrefs({ fit })}
                framed={false}
              />
            </div>
          ) : (
            <ShirtPreview design={shown} copy={copy} style={prefs.style} color={prefs.color} view={prefs.view} />
          )}
          <div className="px-1 pb-4 pt-3">
            <DesignBadges option={o} />
            <p className="mt-2 text-[13px] text-muted">{describeDesign(o)}</p>
          </div>
        </div>
      </div>

      <div>
        {o.archived ? (
          <div className="mt-5 lg:mt-0">
            <ArchivedNote at={o.archived.at} by={o.archived.by} what="design" busy={shelf.busy} onRestore={shelf.restore} />
          </div>
        ) : null}
        <div className="mt-5 rounded-3xl bg-white p-4 lg:mt-0 shadow-[var(--shadow-card)]">
          <GarmentPicker style={prefs.style} color={prefs.color} onChange={(p) => setPrefs(p)} compact />
        </div>

        {o.archived ? null : (
          <div className="mt-6">
            <ReactionButtons
              value={mine}
              onReact={(v) => react(o.id, mine === v ? null : v).catch((e) => toast((e as Error).message, 'error'))}
            />
          </div>
        )}

        {state.canApprove && state.project.status !== 'approved' && !o.archived ? (
          <div className="mt-6 rounded-3xl bg-lagoon-soft p-5 text-center">
            <p className="font-display text-lg font-semibold text-lagoon-deep">Is this the one?</p>
            <p className="mb-4 mt-1 text-sm text-lagoon-deep/80">You can still change the shirt, color and sizes on the next screen.</p>
            <LinkButton href={`${base}/approve?option=${o.id}`} size="lg" icon="check" className="w-full">
              Choose this design
            </LinkButton>
          </div>
        ) : null}

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wider text-muted">Make a version</h2>
        <p className="mb-3 text-sm text-muted">Each one is a new design; this one stays as it is.</p>
        <div className={BUTTON_PAIRS}>
          <Button variant="secondary" icon="wand" onClick={() => setTweaking(true)}>
            Change it
          </Button>
          <Button variant="secondary" icon="type" onClick={() => setWording(true)}>
            Words
          </Button>
          <Button variant="secondary" icon="palette" onClick={() => setColoring(true)}>
            Colors
          </Button>
          <Button variant="secondary" icon="layers" onClick={moreLike} busy={busy}>
            More like this
          </Button>
        </div>
        {state.ai.art ? (
          <div className="mt-2 flex justify-center">
            <NewArtButton basedOn={o} label="New artwork in this style" variant="secondary" />
          </div>
        ) : null}

        <LinkButton href={back.href} variant="secondary" icon={from === 'browse' || !from ? 'cards' : 'chevronLeft'} className="mt-6 w-full">
          {back.button}
        </LinkButton>

        <div className="mt-3 flex flex-wrap justify-center gap-2 empty:hidden">
          {o.archived ? null : <CompareButton optionId={o.id} />}
          {o.archived || chosen ? null : (
            <Button variant="ghost" size="sm" icon="archive" onClick={shelf.archive} busy={shelf.busy}>
              {members === 1 ? 'Archive it' : members === 2 ? 'Archive for both of us' : 'Archive for everyone'}
            </Button>
          )}
        </div>
      </div>

      <ComparePill />
      <TweakSheet option={o} open={tweaking} onClose={() => setTweaking(false)} onCreated={goTo} />
      <ColorsSheet
        option={o}
        open={coloring}
        onClose={() => setColoring(false)}
        onDraft={setDraft}
        onSaved={(n) => {
          setColoring(false);
          goTo(n);
        }}
      />
      <WordsSheet
        open={wording}
        onClose={() => setWording(false)}
        initial={copy}
        onSave={async (c) => {
          const res = await http<{ option: ShirtOption }>(`/api/projects/${state.project.id}/edit`, {
            body: { optionId: o.id, patch: { copyOverride: c } },
          });
          const kept = await addVersion(res.option, o.id);
          toast(kept ? 'Made a version with its own words. It’s in Favorites too.' : 'Made a version with its own words');
          setWording(false);
          goTo(res.option);
        }}
      />
    </div>
  );
}

function WordsSheet({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Copy; onSave: (c: Copy) => Promise<void> }) {
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = 'w-full rounded-2xl bg-white px-4 py-3 text-[16px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon';
  const label = 'mb-1 block text-sm font-medium';
  return (
    <Sheet open={open} onClose={onClose} title="Words for just this one">
      <p className="mb-4 text-[15px] text-muted">The project&apos;s words stay the same; only this new version gets these.</p>
      <div className="space-y-3">
        <label className="block">
          <span className={label}>Big words</span>
          <textarea className={`${input} resize-none`} rows={2} value={c.headline} onChange={(e) => setC({ ...c, headline: e.target.value })} />
        </label>
        <label className="block">
          <span className={label}>Small words</span>
          <input className={input} value={c.tagline} onChange={(e) => setC({ ...c, tagline: e.target.value })} />
        </label>
        <label className="block">
          <span className={label}>
            Tiny line <span className="font-normal text-muted">(optional)</span>
          </span>
          <input className={input} value={c.extra} onChange={(e) => setC({ ...c, extra: e.target.value })} />
        </label>
      </div>
      <Button
        size="lg"
        className="mb-2 mt-4 w-full"
        busy={busy}
        icon="check"
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(c);
          } catch (e) {
            toast((e as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Make this version
      </Button>
    </Sheet>
  );
}
