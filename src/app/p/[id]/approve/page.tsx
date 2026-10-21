'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { otherName, useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { BackPreview } from '@/components/BackPreview';
import { backName } from '@/components/BackMeta';
import { TryOn3D } from '@/components/TryOn3D';
import { GarmentPicker } from '@/components/GarmentPicker';
import { Icon } from '@/components/Icon';
import { Button, LinkButton, PageTitle } from '@/components/ui';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import { useFonts } from '@/lib/client/fonts';
import { backWidthIn, backWords } from '@/lib/design/back/render';
import { backTemplate } from '@/lib/design/back/templates';
import { colorName, hardToRead, partLabel, partsShown } from '@/lib/design/colors';
import { garmentColor } from '@/lib/design/palettes';
import { PRINT_PRESETS, printSizeIn } from '@/lib/design/garments';
import { printedCopy } from '@/lib/design/printed';
import type { GarmentStyle } from '@/lib/design/types';
import { SIZES, type SizeLine } from '@/lib/kinds/shirt';
import { fitFor } from '@/lib/three/body';
import { heartBadge } from '@/lib/engine/together';
import { FinalSay } from '@/components/FinalSay';

export default function ApprovePageWrapper() {
  return (
    <Suspense>
      <ApprovePage />
    </Suspense>
  );
}

function ApprovePage() {
  const { state, matches, myReaction, otherLoves, option, refresh, backs, backOption, wearer, lovers, members } = useProject();
  const fonts = useFonts();
  const [prefs, setPrefs] = usePrefs();
  const [show3d, setShow3d] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const base = `/p/${state.project.id}`;

  const candidates = useMemo(() => {
    const hearts = state.options.filter((o) => myReaction(o.id) === 'love' && !matches.includes(o));
    const pre = params.get('option');
    const preset = pre ? option(pre) : undefined;
    const list = [...matches, ...hearts];
    return preset && !list.includes(preset) ? [preset, ...list] : list;
  }, [state.options, matches, myReaction, params, option]);

  const [pickId, setPickId] = useState<string | null>(params.get('option') ?? candidates[0]?.id ?? null);

  // Backs: the one asked for, then ones you love with others, then your hearts, then theirs.
  const backCandidates = useMemo(() => {
    const loved = backs.filter((o) => myReaction(o.id) === 'love' || otherLoves(o.id));
    const pre = params.get('back');
    const preset = pre ? backOption(pre) : undefined;
    return preset && !loved.includes(preset) ? [preset, ...loved] : loved;
  }, [backs, myReaction, otherLoves, params, backOption]);
  const [backId, setBackId] = useState<string | null>(params.get('back') ?? backCandidates[0]?.id ?? null);
  const [style, setStyle] = useState<GarmentStyle>(prefs.style);
  const [color, setColor] = useState(prefs.color);
  const [preset, setPreset] = useState(prefs.style === 'hoodie' ? 'medium' : 'standard');
  const [sizes, setSizes] = useState<SizeLine[]>(() => {
    const people = state.facts.people.filter((p) => p.trim());
    return (people.length ? people : [state.me.name]).slice(0, 12).map((who) => ({ who, size: 'M', qty: 1 }));
  });
  const [notes, setNotes] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = pickId ? option(pickId) : undefined;
  const back = backId ? backOption(backId) : undefined;

  if (!state.canApprove) {
    return (
      <div className="animate-pop pt-6 text-center">
        <PageTitle title={`${state.approverName} makes the final call`} sub={`Keep hearting designs; the ones ${members <= 2 ? 'you both love' : 'more of you love'} are at the top of ${state.approverName}’s list.`} />
        <LinkButton href={`${base}/favorites`} icon="star">
          See favorites
        </LinkButton>
        <FinalSay className="mt-6" />
      </div>
    );
  }
  if (state.project.status === 'approved') {
    return (
      <div className="animate-pop pt-6 text-center">
        <PageTitle title="Already approved" sub="The print files are ready." />
        <LinkButton href={`${base}/done`} icon="download">
          Get the print files
        </LinkButton>
      </div>
    );
  }
  if (!candidates.length) {
    return (
      <div className="animate-pop pt-6 text-center">
        <PageTitle title="Heart a few first" sub="Pick the final from the designs you've hearted." />
        <LinkButton href={`${base}/browse`} icon="heart">
          Browse designs
        </LinkButton>
      </div>
    );
  }

  const copy = pick ? pick.payload.copyOverride ?? state.project.brief.copy : state.project.brief.copy;
  const total = sizes.reduce((a, s) => a + (s.qty || 0), 0);
  const presetObj = PRINT_PRESETS.find((p) => p.id === preset)!;
  const dims = printSizeIn(presetObj);
  const backPersonal = back ? !!backTemplate(back.payload.template).personal : false;
  const shirt = garmentColor(color);
  // Colors picked for particular words stay put on any shirt, so say when one won't show up.
  const faint = pick ? hardToRead(pick.payload.colors, shirt.hex, partsShown(pick.payload, copy)).map((p) => `${colorName(pick.payload.colors![p]!).toLowerCase()} ${partLabel(p).toLowerCase()}`) : [];
  const backLines =
    back && pick && fonts
      ? backWords(back.payload, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k) => k, facts: state.facts, wearer }, pick.payload)
      : [];

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await http(`/api/projects/${state.project.id}/approve`, {
        body: { optionId: pick.id, garment: style, color, preset, sizes, notes, backOptionId: back?.id ?? null },
      });
      await refresh();
      router.push(`${base}/done`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  const section = (n: number, title: string, children: React.ReactNode) => (
    <section className="mb-6 lg:col-start-2">
      <h2 className="mb-3 flex items-center gap-2.5 font-display text-xl font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lagoon text-sm font-semibold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );

  return (
    <div className="animate-pop">
      <PageTitle kicker="The final step" title="Pick the one" sub="Check everything once. After this, the print files get made." />

      <div className="lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-x-10">
        {section(
          1,
          'The design',
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            {candidates.map((o) => (
              <button
                key={o.id}
                onClick={() => setPickId(o.id)}
                className={`relative w-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ${pickId === o.id ? 'ring-[3px] ring-lagoon' : ''}`}
              >
                <div className="bg-sand-2/60 px-2 pt-2">
                  <ShirtPreview design={o.payload} copy={o.payload.copyOverride ?? state.project.brief.copy} style={style} color={color} />
                </div>
                {otherLoves(o.id) && heartBadge(lovers(o.id).length, members) ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-semibold text-white">{heartBadge(lovers(o.id).length, members)} ♥</span>
                ) : null}
              </button>
            ))}
          </div>,
        )}

        {pick ? (
          <div className="mb-6 lg:sticky lg:top-32 lg:col-start-1 lg:row-start-1 lg:mb-0 lg:self-start lg:[grid-row-end:span_12]">
            <div className="mb-2 flex justify-end">
              <div className="flex gap-1 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Preview">
                {[
                  { on: false, label: 'Flat' },
                  { on: true, label: 'Spin it in 3D' },
                ].map((v) => (
                  <button
                    key={v.label}
                    role="radio"
                    aria-checked={show3d === v.on}
                    onClick={() => setShow3d(v.on)}
                    className={`h-8 rounded-full px-3 text-sm font-medium ${show3d === v.on ? 'bg-white shadow-sm' : 'text-ink/60'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            {show3d ? (
              <TryOn3D
                design={pick.payload}
                copy={copy}
                style={style}
                color={color}
                widthIn={presetObj.widthIn}
                placement={presetObj.placement}
                fit={prefs.fit ?? fitFor(state.me.id)}
                onFitChange={(fit) => setPrefs({ fit })}
                back={back ? { design: back.payload, facts: state.facts, front: pick.payload, widthIn: backWidthIn(back.payload.size, style), wearer } : null}
              />
            ) : (
              <div className="overflow-hidden rounded-[28px] bg-gradient-to-b from-lagoon-soft to-sand-2 px-4 pt-4 shadow-[var(--shadow-lift)]">
                {back ? (
                  <div className="grid grid-cols-2 gap-2 pb-2">
                    <ShirtPreview design={pick.payload} copy={copy} style={style} color={color} view="full" printWidthIn={presetObj.widthIn} placement={presetObj.placement} label="Front" />
                    <BackPreview back={back.payload} facts={state.facts} front={pick.payload} copy={copy} style={style} color={color} view="full" wearer={wearer} label={`Back: ${backName(back)}`} />
                  </div>
                ) : (
                  <ShirtPreview design={pick.payload} copy={copy} style={style} color={color} view="full" printWidthIn={presetObj.widthIn} placement={presetObj.placement} />
                )}
              </div>
            )}
          </div>
        ) : null}

        {section(
          2,
          'The back',
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            <button
              onClick={() => setBackId(null)}
              aria-pressed={!back}
              className={`flex w-32 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl bg-white p-3 text-center text-sm font-medium shadow-[var(--shadow-card)] ${!back ? 'ring-[3px] ring-lagoon' : ''}`}
            >
              <Icon name="shirt" size={28} className="text-ink/40" />
              Nothing on the back
            </button>
            {pick
              ? backCandidates.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setBackId(o.id)}
                    aria-pressed={backId === o.id}
                    aria-label={backName(o)}
                    className={`relative w-32 shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ${backId === o.id ? 'ring-[3px] ring-lagoon' : ''}`}
                  >
                    <div className="bg-sand-2/60 px-2 pt-2">
                      <BackPreview back={o.payload} facts={state.facts} front={pick.payload} copy={copy} style={style} color={color} wearer={wearer} />
                    </div>
                    {myReaction(o.id) === 'love' && otherLoves(o.id) ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-semibold text-white">{heartBadge(lovers(o.id).length, members)} ♥</span>
                    ) : null}
                  </button>
                ))
              : null}
            {!backCandidates.length ? (
              <LinkButton href={`${base}/back`} variant="secondary" className="shrink-0 self-center">
                See back ideas
              </LinkButton>
            ) : null}
          </div>,
        )}

        {section(
          3,
          'The shirt',
          <div className="rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
            <GarmentPicker
              style={style}
              color={color}
              onChange={(p) => {
                if (p.style) {
                  setStyle(p.style);
                  if (p.style === 'hoodie' && preset === 'standard') setPreset('medium');
                }
                if (p.color) setColor(p.color);
              }}
            />
            {faint.length ? (
              <p className="mt-3 rounded-2xl bg-sun-soft px-3 py-2 text-sm text-[#6b4f0c]">
                The {faint.join(' and ')} will be hard to read on a {shirt.name.toLowerCase()} shirt. Try another shirt color, or change the design&apos;s colors.
              </p>
            ) : null}
          </div>,
        )}

        {section(
          4,
          'Print size',
          <div className="space-y-2">
            {PRINT_PRESETS.map((p) => {
              const d = printSizeIn(p);
              return (
                <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-card)] ${preset === p.id ? 'ring-2 ring-lagoon' : ''}`}>
                  <input type="radio" name="preset" className="h-5 w-5 accent-[#0e7c86]" checked={preset === p.id} onChange={() => setPreset(p.id)} />
                  <span className="flex-1">
                    <span className="block font-medium">
                      {p.name} <span className="font-normal text-muted">· {d.w} × {d.h} in</span>
                    </span>
                    <span className="block text-sm text-muted">{p.note}</span>
                  </span>
                </label>
              );
            })}
            <p className="px-1 text-xs text-muted">Not sure? Standard is what most shops do. The shop will say if they need something different, and the package also includes the full 15 × 18 in master.</p>
          </div>,
        )}

        {section(
          5,
          'Who gets one',
          <div className="rounded-3xl bg-white p-3 shadow-[var(--shadow-card)]">
            {sizes.map((s, i) => (
              <div key={i} className={`flex items-center gap-2 px-1 py-2 ${i ? 'border-t border-line/70' : ''}`}>
                <input
                  value={s.who}
                  onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, who: e.target.value } : x)))}
                  placeholder="Name"
                  aria-label="Name"
                  className="h-10 min-w-0 flex-1 rounded-xl bg-sand px-3 outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
                />
                <select
                  value={s.size}
                  onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))}
                  aria-label="Size"
                  className="h-10 rounded-xl bg-sand px-2 outline-none ring-1 ring-line"
                >
                  {SIZES.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
                <div className="flex items-center rounded-xl bg-sand ring-1 ring-line">
                  <button className="h-10 w-9 text-lg" aria-label="One fewer" onClick={() => setSizes(sizes.map((x, j) => (j === i ? { ...x, qty: Math.max(0, x.qty - 1) } : x)))}>
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{s.qty}</span>
                  <button className="h-10 w-9 text-lg" aria-label="One more" onClick={() => setSizes(sizes.map((x, j) => (j === i ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))}>
                    +
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => setSizes([...sizes, { who: '', size: 'M', qty: 1 }])} className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-lagoon">
              <Icon name="shirt" size={16} /> Add someone
            </button>
          </div>,
        )}

        {section(
          6,
          'Notes for the shop (optional)',
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Need them by March 20"
            className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-[16px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
          />,
        )}

        {section(
          7,
          'Check the spelling',
          <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="mb-3 text-sm text-muted">This is exactly what gets printed, letter for letter:</p>
            {pick
              ? printedCopy(pick.payload, copy).map((l) => (
                  <div key={l.label} className="mb-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted">{l.label}</div>
                    <div className="whitespace-pre-wrap text-[22px] font-semibold leading-snug tracking-wide">{l.text}</div>
                  </div>
                ))
              : null}
            {back ? (
              <div className="mb-3 border-t border-line/70 pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">On the back</div>
                {backLines.map((line, i) => (
                  <div key={i} className="text-[17px] font-semibold leading-snug tracking-wide">
                    {line}
                  </div>
                ))}
                {backPersonal ? (
                  <p className="mt-2 text-sm text-muted">
                    Each shirt gets its own name, taken from &ldquo;Who gets one&rdquo;:{' '}
                    <b className="font-semibold text-ink">{[...new Set(sizes.map((x) => x.who.trim()).filter(Boolean))].join(', ').toUpperCase() || state.facts.people.join(', ').toUpperCase()}</b>
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-2xl bg-sand px-4 py-3">
              <input type="checkbox" className="h-5 w-5 accent-[#0e7c86]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span className="font-medium">I&apos;ve checked every word</span>
            </label>
          </div>,
        )}

        <p className="mb-2 text-center text-sm text-muted lg:col-start-2">
          {total} shirt{total === 1 ? '' : 's'} · {dims.w} × {dims.h} in print{back ? ' · printed on the back too' : ''} · {otherName(state)} can download everything too
        </p>
        <Button size="lg" className="mb-4 w-full lg:col-start-2" variant="coral" disabled={!checked || !pick || total === 0} busy={busy} onClick={submit} icon="check">
          Yes, this is the one
        </Button>
      </div>
    </div>
  );
}
