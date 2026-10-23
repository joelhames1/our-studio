'use client';
import { useEffect, useMemo, useState } from 'react';
import { colorChanges, colorName, hardToRead, inksIn, partLabel, partsShown, SWATCHES, wordInks } from '@/lib/design/colors';
import { garmentColor, inksFor, PALETTES } from '@/lib/design/palettes';
import { pairing } from '@/lib/design/pairings';
import { renderDesign } from '@/lib/design/render';
import type { ColorPart, PartColors, ShirtDesign } from '@/lib/design/types';
import { useFonts } from '@/lib/client/fonts';
import { frontFonts } from '@/lib/design/fontsFor';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import type { ShirtOption } from '@/lib/server/studio';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';
import { Sheet } from './Sheet';
import { ShirtPreview } from './ShirtPreview';
import { toast } from './Toast';
import { Button } from './ui';

const same = (a?: PartColors, b?: PartColors) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Exact colors for each part of the lettering, with no AI involved. Nothing
 * saves until "Save as a new version", and the original stays as it was.
 * `onDraft` shows the colors on the page's own preview while choosing.
 */
export function ColorsSheet({
  option,
  open,
  onClose,
  onSaved,
  onDraft,
}: {
  option: ShirtOption;
  open: boolean;
  onClose: () => void;
  onSaved: (o: ShirtOption) => void;
  onDraft?: (d: ShirtDesign | null) => void;
}) {
  const { state, addVersion } = useProject();
  const [prefs] = usePrefs();
  const start = option.payload;
  // Colors don't change the lettering, so this design's fonts are all it needs.
  const fonts = useFonts(useMemo(() => frontFonts(start.pairing), [start.pairing]));
  const [palette, setPalette] = useState(start.palette);
  const [colors, setColors] = useState<PartColors>(start.colors ?? {});
  const [part, setPart] = useState<ColorPart>('headline');
  const [busy, setBusy] = useState(false);

  // Each time it opens, start from the design as it is.
  useEffect(() => {
    if (!open) return;
    setPalette(start.palette);
    setColors(start.colors ?? {});
    setPart('headline');
  }, [open, start]);

  const copy = start.copyOverride ?? state.project.brief.copy;
  const shirt = garmentColor(prefs.color);
  const draft = useMemo<ShirtDesign>(() => {
    const d: ShirtDesign = { ...start, palette, colors };
    if (!Object.keys(colors).length) delete d.colors;
    return d;
  }, [start, palette, colors]);
  const changed = palette !== start.palette || !same(colors, start.colors);

  useEffect(() => {
    if (onDraft) onDraft(open && changed ? draft : null);
  }, [open, changed, draft, onDraft]);

  const parts = partsShown(start, copy);
  const current = parts.includes(part) ? part : parts[0];
  const inks = wordInks(inksFor(palette, shirt), colors);
  const own = colors[current];

  const pick = (hex: string | null) =>
    setColors((c) => {
      const next = { ...c };
      if (hex) next[current] = hex.toUpperCase();
      else delete next[current];
      return next;
    });

  // Screen printers charge per color, so say when a pick adds one.
  const count = useMemo(() => {
    if (!fonts) return null;
    const ctx = { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k: string) => k };
    return { now: inksIn(renderDesign(draft, ctx)).length, was: inksIn(renderDesign(start, ctx)).length };
  }, [fonts, copy, shirt.tone, shirt.hex, draft, start]);

  const unreadable = hardToRead(colors, shirt.hex, parts);
  const emphasis = draft.emphasis ?? pairing(draft.pairing).defaultEmphasis;
  const blended = parts.includes('emphasis') && emphasis === 'color' && inks.emphasis === inks.headline;

  const save = async () => {
    setBusy(true);
    try {
      const patch: Partial<ShirtDesign> = { colors };
      if (palette !== start.palette) patch.palette = palette;
      const res = await http<{ option: ShirtOption }>(`/api/projects/${state.project.id}/edit`, { body: { optionId: option.id, patch } });
      const kept = await addVersion(res.option, option.id);
      const what = [...(palette !== start.palette ? [`${PALETTES.find((p) => p.id === palette)?.name} scheme`] : []), ...colorChanges(start.colors, colors)];
      toast(`Made a new version: ${what.join(', ')}${kept ? ". It's in Favorites too." : ''}`);
      onSaved(res.option);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const heading = 'mb-2 text-xs font-semibold uppercase tracking-wider text-muted';
  return (
    <Sheet open={open} onClose={onClose} title="Colors">
      {/* On a phone the sheet covers the page's preview, so it brings its own. Tapping its words picks them. */}
      <div className="sticky -top-3 z-10 -mx-5 mb-3 bg-sand px-5 pb-2 lg:hidden">
        <div className="mx-auto w-44 overflow-hidden rounded-2xl shadow-[var(--shadow-card)] [@media(max-height:700px)]:w-28">
          <ShirtPreview design={draft} copy={copy} style={prefs.style} color={prefs.color} view="art" label="Preview with these colors" onPickPart={setPart} />
        </div>
        <p className="mt-1.5 text-center text-xs text-muted">Tap the words to pick them</p>
      </div>
      {/* On a laptop the page's own preview shows the colors; this smaller one is for clicking words. */}
      <div className="mb-4 hidden items-center gap-4 lg:flex">
        <div className="w-28 shrink-0 overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
          <ShirtPreview design={draft} copy={copy} style={prefs.style} color={prefs.color} view="art" label="Preview with these colors" onPickPart={setPart} />
        </div>
        <p className="text-sm text-muted">Click the words on this preview to pick them, or choose below.</p>
      </div>

      <div className="flex items-center justify-between">
        <p className={heading}>Words</p>
        {changed ? (
          <button
            onClick={() => {
              setPalette(start.palette);
              setColors(start.colors ?? {});
            }}
            className="mb-2 text-sm text-muted underline underline-offset-4"
          >
            Start over
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Part">
        {parts.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={current === p}
            onClick={() => setPart(p)}
            className={`flex h-10 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-sm font-medium transition ${current === p ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
          >
            <span className="h-7 w-7 rounded-full ring-1 ring-black/10" style={{ background: inks[p] }} />
            {partLabel(p)}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-9 items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{partLabel(current)}:</span> {own ? colorName(own) : <span className="text-muted">from the color scheme</span>}
        </span>
        {own ? (
          <button onClick={() => pick(null)} className="flex items-center gap-1 text-lagoon-deep underline underline-offset-4">
            <Icon name="undo" size={14} /> Back to the color scheme
          </button>
        ) : null}
      </div>

      <div className="mt-2 grid grid-cols-8 gap-1.5" role="group" aria-label={`Colors for the ${partLabel(current).toLowerCase()}`}>
        {SWATCHES.map((s) => {
          const on = own === s.hex;
          return (
            <button
              key={s.id}
              onClick={() => pick(s.hex)}
              aria-label={s.name}
              aria-pressed={on}
              title={s.name}
              className={`aspect-square rounded-full ring-1 ring-black/10 transition active:scale-90 ${on ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
              style={{ background: s.hex }}
            />
          );
        })}
        <label
          title="Any color"
          className={`relative aspect-square cursor-pointer rounded-full ring-1 ring-black/10 ${own && !SWATCHES.some((s) => s.hex === own) ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
          style={{ background: 'conic-gradient(#f2654e, #ffd166, #3e8e41, #3cc8c8, #2f5da8, #b39ddb, #e0457b, #f2654e)' }}
        >
          <input
            type="color"
            aria-label="Any color"
            value={(own ?? inks[current]).toLowerCase()}
            onChange={(e) => pick(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      {unreadable.length || blended ? (
        <div className="mt-3 space-y-1 rounded-2xl bg-sun-soft px-3 py-2 text-sm text-[#6b4f0c]">
          {unreadable.map((p) => (
            <p key={p}>
              {colorName(colors[p]!)} {partLabel(p).toLowerCase()} will be hard to read on a {shirt.name.toLowerCase()} shirt.
            </p>
          ))}
          {blended ? <p>The quoted words match the big words, so they won&apos;t stand out.</p> : null}
        </div>
      ) : null}

      <p className={`${heading} mt-6`}>Whole color scheme</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0" role="radiogroup" aria-label="Color scheme">
        {PALETTES.map((p) => {
          const k = inksFor(p.id, shirt);
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={palette === p.id}
              onClick={() => setPalette(p.id)}
              className={`shrink-0 rounded-2xl bg-white px-3 py-2 text-left ring-1 transition ${palette === p.id ? 'ring-2 ring-ink' : 'ring-line'}`}
            >
              <span className="flex -space-x-1">
                {[k.text, k.accent, k.accent2, k.sun[0]].map((c, i) => (
                  <span key={i} className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: c }} />
                ))}
              </span>
              <span className="mt-1 block whitespace-nowrap text-xs font-medium">{p.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">Changes the artwork and any words without a color of their own.</p>

      {count ? (
        <p className="mt-4 text-sm text-muted">
          Prints in {count.now} {count.now === 1 ? 'color' : 'colors'}
          {count.now !== count.was ? ` (${count.was} before)` : ''}
          {start.art.kind === 'image' ? ', plus the artwork’s own' : ''}. Screen printers charge per color.
        </p>
      ) : null}

      {/* A fade above the button says there's more underneath while the swatches scroll behind it. */}
      <div className="sticky bottom-0 -mx-5 mt-4 bg-sand px-5 pb-4 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-gradient-to-t before:from-sand before:to-transparent lg:-mx-6 lg:px-6">
        <Button size="lg" className="w-full" icon="check" onClick={save} busy={busy} disabled={!changed}>
          Save as a new version
        </Button>
      </div>
    </Sheet>
  );
}
