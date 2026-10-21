'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { BackPreview } from '@/components/BackPreview';
import { BackBadges, backName, describeBack } from '@/components/BackMeta';
import { FactsSheet } from '@/components/FactsSheet';
import { GarmentPicker } from '@/components/GarmentPicker';
import { useProject } from '@/components/ProjectProvider';
import { ReactionButtons } from '@/components/Reactions';
import { ArchivedNote, useDesignArchive } from '@/components/ArchiveBits';
import { ShirtPreview } from '@/components/ShirtPreview';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { TryOn3D } from '@/components/TryOn3D';
import { Button, BUTTON_PAIRS, LinkButton } from '@/components/ui';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import { backWidthIn } from '@/lib/design/back/render';
import { backTemplate } from '@/lib/design/back/templates';
import type { BackDesign } from '@/lib/design/back/types';
import type { BackOption } from '@/lib/server/studio';
import { fitFor } from '@/lib/three/body';

const VIEWS = [
  { id: 'chest', label: 'Close-up' },
  { id: 'full', label: 'Shirt' },
  { id: 'pair', label: 'Both sides' },
  { id: '3d', label: '3D' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export default function BackOptionPage() {
  const { optionId } = useParams<{ optionId: string }>();
  const { state, anyBack, referenceFront, myReaction, react, remixBacks, addBacks, wearer, members } = useProject();
  const [prefs, setPrefs] = usePrefs();
  const router = useRouter();
  const [view, setView] = useState<View>('chest');
  const [editing, setEditing] = useState(false);
  const [tweaking, setTweaking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const o = anyBack(optionId);
  const shelf = useDesignArchive(optionId);
  const base = `/p/${state.project.id}`;

  if (!o || !referenceFront) {
    return (
      <div className="pt-10 text-center text-muted">
        That back isn&apos;t here anymore.
        <div className="mt-4">
          <LinkButton href={`${base}/back`}>All the backs</LinkButton>
        </div>
      </div>
    );
  }
  const t = backTemplate(o.payload.template);
  const front = referenceFront.payload;
  const copy = front.copyOverride ?? state.project.brief.copy;
  const mine = myReaction(o.id);
  const goTo = (n: BackOption) => router.push(`${base}/b/${n.id}`);

  const edit = async (patch: Partial<Record<keyof BackDesign, unknown>>, what: string) => {
    setBusy(what);
    try {
      const res = await http<{ option: BackOption }>(`/api/projects/${state.project.id}/backs/edit`, { body: { optionId: o.id, patch } });
      addBacks([res.option]);
      goTo(res.option);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const moreLike = async () => {
    setBusy('more');
    try {
      const created = await remixBacks({ parentId: o.id, count: 4 });
      toast(`${created.length} variations added to the backs`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const preview = (v: 'chest' | 'full') => (
    <BackPreview back={o.payload} facts={state.facts} front={front} copy={copy} style={prefs.style} color={prefs.color} view={v} wearer={wearer} label={`Back: ${backName(o)}`} />
  );

  return (
    <div className="animate-pop lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start lg:gap-10">
      <div className="lg:sticky lg:top-32">
        <div className="mb-3 flex gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={`h-9 flex-1 rounded-full text-sm font-medium transition ${view === v.id ? 'bg-white shadow-sm' : 'text-ink/60'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[28px] bg-gradient-to-b from-sand-2/60 to-white px-4 pt-4 shadow-[var(--shadow-lift)]">
          {view === '3d' ? (
            <div className="pb-1">
              <TryOn3D
                design={front}
                copy={copy}
                style={prefs.style}
                color={prefs.color}
                widthIn={prefs.style === 'hoodie' ? 10 : 12}
                placement="center"
                fit={prefs.fit ?? fitFor(state.me.id)}
                onFitChange={(fit) => setPrefs({ fit })}
                framed={false}
                back={{ design: o.payload, facts: state.facts, front, widthIn: backWidthIn(o.payload.size, prefs.style), wearer }}
                startFacing="back"
              />
            </div>
          ) : view === 'pair' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <ShirtPreview design={front} copy={copy} style={prefs.style} color={prefs.color} view="full" label="Front" />
                <div className="pb-1 text-center text-xs font-medium text-muted">Front</div>
              </div>
              <div>
                {preview('full')}
                <div className="pb-1 text-center text-xs font-medium text-muted">Back</div>
              </div>
            </div>
          ) : (
            preview(view)
          )}
          <div className="px-1 pb-4 pt-3">
            <h1 className="font-display text-lg font-semibold">{backName(o)}</h1>
            <p className="mb-2 text-[13px] text-muted">{describeBack(o)}</p>
            <BackBadges option={o} />
          </div>
        </div>
      </div>

      <div className="lg:[&>*:first-child]:mt-0">
        {t.variants.length > 1 ? (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Layout</div>
            <div className="flex flex-wrap gap-2">
              {t.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => v.id !== o.payload.variant && edit({ variant: v.id }, `v-${v.id}`)}
                  disabled={!!busy}
                  aria-pressed={v.id === o.payload.variant}
                  className={`h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 ${v.id === o.payload.variant ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {t.sizes.length > 1 ? (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Size</div>
            <div className="flex gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Back print size">
              {(['full', 'neck'] as const).map((sz) => (
                <button
                  key={sz}
                  role="radio"
                  aria-checked={o.payload.size === sz}
                  onClick={() => sz !== o.payload.size && edit({ size: sz }, `s-${sz}`)}
                  disabled={!!busy}
                  className={`h-10 flex-1 rounded-full text-sm font-medium transition ${o.payload.size === sz ? 'bg-white shadow-sm' : 'text-ink/60'}`}
                >
                  {sz === 'full' ? `Big (${backWidthIn('full', prefs.style)} in)` : 'Small, under the collar'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {o.archived ? (
          <div className="mt-5">
            <ArchivedNote at={o.archived.at} by={o.archived.by} what="back" busy={shelf.busy} onRestore={shelf.restore} />
          </div>
        ) : null}
        <div className="mt-5 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
          <GarmentPicker style={prefs.style} color={prefs.color} onChange={(p) => setPrefs(p)} compact />
        </div>

        {o.archived ? null : (
          <div className="mt-6">
            <ReactionButtons value={mine} onReact={(v) => react(o.id, mine === v ? null : v).catch((e) => toast((e as Error).message, 'error'))} />
          </div>
        )}

        <div className={`mt-6 ${BUTTON_PAIRS}`}>
          <Button variant="secondary" icon="layers" onClick={moreLike} busy={busy === 'more'}>
            More like this
          </Button>
          <Button variant="secondary" icon="wand" onClick={() => setTweaking(true)}>
            Change something
          </Button>
          <Button variant="secondary" icon="type" onClick={() => setEditing(true)}>
            Edit the details
          </Button>
          <LinkButton href={`${base}/back`} variant="secondary" icon="grid">
            All the backs
          </LinkButton>
        </div>
        {o.payload.palette || o.payload.pairing ? (
          <div className="mt-2 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => edit({ palette: null, pairing: null }, 'match')} busy={busy === 'match'}>
              Match the front&apos;s colors and fonts
            </Button>
          </div>
        ) : null}
        {o.archived || (state.project.status === 'approved' && state.decision?.snapshot.back?.optionId === o.id) ? null : (
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" size="sm" icon="archive" onClick={shelf.archive} busy={shelf.busy}>
              {members === 1 ? 'Archive it' : members === 2 ? 'Archive for both of us' : 'Archive for everyone'}
            </Button>
          </div>
        )}

        {state.canApprove && state.project.status !== 'approved' && !o.archived ? (
          <div className="mt-8 rounded-3xl bg-lagoon-soft p-5 text-center">
            <p className="font-display text-lg font-semibold text-lagoon-deep">This one on the back?</p>
            <p className="mb-4 mt-1 text-sm text-lagoon-deep/80">You&apos;ll pick the front and check everything on the next screen.</p>
            <LinkButton href={`${base}/approve?back=${o.id}`} size="lg" icon="check" className="w-full">
              Use this back
            </LinkButton>
          </div>
        ) : null}
      </div>

      <FactsSheet open={editing} onClose={() => setEditing(false)} focus={t.uses} />
      <BackTweakSheet option={o} open={tweaking} onClose={() => setTweaking(false)} onCreated={goTo} />
    </div>
  );
}

const QUICK = ['Smaller, under the collar', 'Bigger', 'Different colors', 'Navy and gold', 'Typewriter lettering', 'Match the front'];

function BackTweakSheet({ option, open, onClose, onCreated }: { option: BackOption; open: boolean; onClose: () => void; onCreated: (o: BackOption) => void }) {
  const { state, addBacks } = useProject();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (request: string) => {
    if (!request.trim()) return;
    setBusy(true);
    try {
      const res = await http<{ option: BackOption; summary: string }>(`/api/projects/${state.project.id}/backs/edit`, { body: { optionId: option.id, request } });
      addBacks([res.option]);
      toast(`Made a new version: ${res.summary}`);
      setText('');
      onClose();
      onCreated(res.option);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="What should change?">
      <p className="mb-3 text-[15px] text-muted">Colors, lettering, size or layout. To change the words themselves, use Edit the details.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="e.g. smaller, in navy and gold"
        className="mb-3 w-full resize-none rounded-2xl bg-white px-4 py-3 text-[17px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} onClick={() => send(q)} disabled={busy} className="rounded-full bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-line active:scale-95">
            {q}
          </button>
        ))}
      </div>
      <Button size="lg" className="mb-2 w-full" onClick={() => send(text)} busy={busy} icon="wand" disabled={!text.trim()}>
        Make it
      </Button>
    </Sheet>
  );
}
