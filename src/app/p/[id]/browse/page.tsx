'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { ReactionButtons } from '@/components/Reactions';
import { DesignBadges, describeDesign } from '@/components/DesignMeta';
import { TweakForm, TweakSheet } from '@/components/TweakSheet';
import { ViewButton } from '@/components/ViewSheet';
import { NewArtButton } from '@/components/NewArtButton';
import { Icon } from '@/components/Icon';
import { BottomBar, Button, LinkButton } from '@/components/ui';
import { toast } from '@/components/Toast';
import { onShortcut } from '@/lib/client/keys';
import { useDesktop } from '@/lib/client/media';
import { flatView, usePrefs } from '@/lib/client/prefs';
import { loadSwipes, MAX_SWIPES, saveSwipes, type Swipe } from '@/lib/client/swipes';
import type { Copy } from '@/lib/design/types';
import type { ReactionValue } from '@/lib/engine/types';
import type { ShirtOption } from '@/lib/server/studio';

const THRESHOLD = 110;

export default function BrowsePage() {
  const { state, deck, react, remix, addOptions, myReaction, option } = useProject();
  const [prefs, setPrefs] = usePrefs();
  const [exit, setExit] = useState<ReactionValue | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Recent swipes, newest last, so Undo can step back more than once.
  const [history, setHistory] = useState<Swipe[]>([]);
  const [tweaking, setTweaking] = useState(false);
  const [busy, setBusy] = useState<'more' | 'fresh' | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const router = useRouter();
  const desktop = useDesktop();
  const grid = desktop && prefs.browse === 'grid';

  const top = deck[0];
  const next = deck[1];
  const base = `/p/${state.project.id}`;
  const projectId = state.project.id;
  const passed = state.options.filter((o) => myReaction(o.id) === 'pass').length;

  useEffect(() => {
    setHistory(loadSwipes(projectId));
  }, [projectId]);
  const remember = (list: Swipe[]) => {
    const trimmed = list.slice(-MAX_SWIPES);
    setHistory(trimmed);
    saveSwipes(projectId, trimmed);
  };
  const push = (swipes: Swipe[]) =>
    setHistory((list) => {
      const next = [...list, ...swipes].slice(-MAX_SWIPES);
      saveSwipes(projectId, next);
      return next;
    });

  // Reacting from the grid: no card animation, straight to the next one.
  const reactTo = (o: ShirtOption, value: ReactionValue) => {
    push([{ id: o.id, value }]);
    react(o.id, value).catch((e) => toast((e as Error).message, 'error'));
    if (value === 'love') toast('Hearted ♥');
  };

  const act = (value: ReactionValue) => {
    if (!top || exit) return;
    const option = top;
    setExit(value);
    setTimeout(() => {
      setExit(null);
      setDrag(0);
      remember([...history, { id: option.id, value }]);
      react(option.id, value).catch((e) => toast((e as Error).message, 'error'));
      if (value === 'love') toast('Hearted ♥');
    }, 230);
  };

  // Steps back through recent swipes. One you've since changed elsewhere (hearted
  // it from Favorites, say) is skipped rather than undone.
  const undo = async () => {
    const rest = [...history];
    let swipe = rest.pop();
    while (swipe && myReaction(swipe.id) !== swipe.value) swipe = rest.pop();
    remember(rest);
    const o = swipe && option(swipe.id);
    if (!swipe || !o) return;
    try {
      await react(o.id, null);
      addOptions([o], true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const canUndo = history.some((s) => myReaction(s.id) === s.value);

  const more = async (parentId: string | null) => {
    setBusy(parentId ? 'more' : 'fresh');
    try {
      const created = await remix(parentId, parentId ? 4 : 8);
      toast(parentId ? `${created.length} new variations up next` : `${created.length} fresh designs`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const onDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!start.current) return;
    setDrag(e.clientX - start.current.x);
  };
  const onUp = (e: PointerEvent) => {
    const tap = start.current && Math.abs(e.clientX - start.current.x) < 6 && Math.abs(e.clientY - start.current.y) < 6;
    start.current = null;
    setDragging(false);
    if (tap && top) return router.push(`${base}/o/${top.id}`);
    if (drag > THRESHOLD) act('love');
    else if (drag < -THRESHOLD) act('pass');
    else setDrag(0);
  };

  // On a laptop: arrows (or L, M, P) to react, Z to undo, Enter to look
  // closer. Set up again on every render, so it always acts on the card
  // that's showing. The grid has keys of its own.
  useEffect(() =>
    onShortcut((e) => {
      if (grid) return false;
      const keys: Record<string, () => void> = {
        ArrowRight: () => act('love'),
        ArrowLeft: () => act('pass'),
        ArrowDown: () => act('maybe'),
        l: () => act('love'),
        L: () => act('love'),
        m: () => act('maybe'),
        M: () => act('maybe'),
        p: () => act('pass'),
        P: () => act('pass'),
        z: () => canUndo && void undo(),
        Z: () => canUndo && void undo(),
        Enter: () => top && router.push(`${base}/o/${top.id}`),
      };
      const run = keys[e.key];
      if (!run) return false;
      run();
      return true;
    }),
  );

  if (!top) {
    return (
      <div className="animate-pop pt-6 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-lagoon-soft text-lagoon">
          <Icon name="check" size={36} />
        </div>
        <h1 className="font-display text-[28px] font-semibold">You&apos;ve seen them all</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">Want more? Fresh ideas are instant. New artwork takes about half a minute.</p>
        {canUndo || passed ? (
          <div className="mx-auto mt-4 flex max-w-sm flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            {canUndo ? (
              <button onClick={undo} className="inline-flex items-center gap-1.5 font-medium text-lagoon">
                <Icon name="undo" size={15} /> Undo last swipe
              </button>
            ) : null}
            {passed ? (
              <Link href={`${base}/favorites?tab=passed`} className="font-medium text-lagoon underline underline-offset-4">
                Take another look at the {passed} you passed
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
          <Button size="lg" onClick={() => more(null)} busy={busy === 'fresh'} icon="shuffle">
            Fresh ideas
          </Button>
          <NewArtButton />
          <LinkButton href={`${base}/favorites`} variant="secondary" size="lg" icon="star">
            See favorites
          </LinkButton>
        </div>
      </div>
    );
  }

  const copyOf = (o: ShirtOption) => o.payload.copyOverride ?? state.project.brief.copy;
  const mode = desktop ? <BrowseMode grid={grid} onChange={(g) => setPrefs({ browse: g ? 'grid' : 'cards' })} /> : null;

  if (grid) {
    return (
      <BrowseGrid
        deck={deck}
        base={base}
        copyOf={copyOf}
        mode={mode}
        reactTo={reactTo}
        canUndo={canUndo}
        undo={undo}
        passRest={async () => {
          const rest = [...deck];
          if (!rest.length || !confirm(`Pass on all ${rest.length}? They wait on the Passed tab if you change your mind.`)) return;
          push(rest.map((o) => ({ id: o.id, value: 'pass' as const })));
          for (let i = 0; i < rest.length; i += 4) {
            await Promise.all(rest.slice(i, i + 4).map((o) => react(o.id, 'pass').catch(() => undefined)));
          }
          toast(`Passed on ${rest.length}`);
        }}
      />
    );
  }

  const exitX = exit === 'love' ? 600 : exit === 'pass' ? -600 : 0;
  const exitY = exit === 'maybe' ? -500 : 0;
  const dx = exit ? exitX : drag;
  const rotate = dx / 18;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start lg:gap-10">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted">
            {deck.length} to look at
          </span>
          {mode}
          <ViewButton />
        </div>

        <div className="relative mx-auto" style={{ maxWidth: prefs.view === 'full' ? 560 : 440 }}>
          {next ? (
            <div className="absolute inset-0 translate-y-3 scale-[0.95] rounded-[28px] bg-white opacity-70 shadow-[var(--shadow-card)]" aria-hidden="true">
              <div className="px-6 pt-6 opacity-60">
                <ShirtPreview design={next.payload} copy={copyOf(next)} style={prefs.style} color={prefs.color} view={flatView(prefs.view)} />
              </div>
            </div>
          ) : null}
          <div
            key={top.id}
            className="animate-pop relative touch-pan-y select-none rounded-[28px] bg-white shadow-[var(--shadow-lift)]"
            style={{
              transform: `translate(${dx}px, ${exitY}px) rotate(${rotate}deg)`,
              transition: dragging ? 'none' : 'transform 0.23s cubic-bezier(0.2,0.8,0.2,1), opacity 0.23s',
              opacity: exit ? 0 : 1,
            }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              start.current = null;
              setDragging(false);
              setDrag(0);
            }}
          >
            <div className="relative overflow-hidden rounded-t-[28px] bg-gradient-to-b from-sand-2/60 to-white px-6 pt-6">
              <ShirtPreview design={top.payload} copy={copyOf(top)} style={prefs.style} color={prefs.color} view={flatView(prefs.view)} />
              {/* On a phone the badges ride on the card, where "Erin loves this" is seen before voting: below it, they'd be under the buttons. */}
              <div className="pointer-events-none absolute left-4 top-4 max-w-[55%] lg:hidden">
                <DesignBadges option={top} className="flex flex-col items-start gap-1.5" />
              </div>
            </div>
            {/* On a laptop these sit in the panel beside the card. */}
            <p className="px-5 pb-4 pt-3 text-[13px] text-muted lg:hidden">{describeDesign(top)}</p>
            <Stamp show={dx > 30} text="Love" className="left-5 -rotate-12 border-coral text-coral" opacity={Math.min(1, dx / THRESHOLD)} />
            <Stamp show={dx < -30} text="Pass" className="right-5 rotate-12 border-ink text-ink" opacity={Math.min(1, -dx / THRESHOLD)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2 lg:hidden">
          <Button variant="secondary" size="sm" icon="layers" onClick={() => more(top.id)} busy={busy === 'more'}>
            More like this
          </Button>
          <Button variant="secondary" size="sm" icon="wand" onClick={() => setTweaking(true)}>
            Change something
          </Button>
          <LinkButton href={`${base}/o/${top.id}`} variant="secondary" size="sm" icon="zoom">
            Look closer
          </LinkButton>
        </div>

        <BottomBar>
          <div className="relative">
            {canUndo ? (
              <button onClick={undo} aria-label="Undo last swipe" className="absolute -top-1 left-0 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-sm text-muted ring-1 ring-line">
                <Icon name="undo" size={15} /> Undo
              </button>
            ) : null}
            <ReactionButtons onReact={act} keyHints />
            <p className="mt-2 text-center text-xs text-muted">
              <span className="lg:hidden">Swipe right to love, left to pass</span>
              <span className="hidden lg:inline">
                Keys: <Kbd>←</Kbd> pass · <Kbd>↓</Kbd> maybe · <Kbd>→</Kbd> love · <Kbd>Z</Kbd> undo · <Kbd>Enter</Kbd> look closer
              </span>
            </p>
          </div>
        </BottomBar>
      </div>

      {desktop ? (
        <aside className="hidden space-y-4 lg:sticky lg:top-32 lg:block" aria-label="This design">
          <section className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
            <DesignBadges option={top} />
            <p className="mt-2 text-sm text-muted">{describeDesign(top)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon="layers" onClick={() => more(top.id)} busy={busy === 'more'}>
                More like this
              </Button>
              <LinkButton href={`${base}/o/${top.id}`} variant="secondary" size="sm" icon="zoom">
                Look closer
              </LinkButton>
            </div>
          </section>
          <section className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 className="mb-1 font-display text-lg font-semibold">Change something</h2>
            <TweakForm key={top.id} option={top} inline />
          </section>
          {deck.length > 1 ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Up next</h2>
              <div className="grid grid-cols-4 gap-2">
                {deck.slice(1, 5).map((o) => (
                  <Link
                    key={o.id}
                    href={`${base}/o/${o.id}`}
                    aria-label={`Up next: ${describeDesign(o)}`}
                    className="overflow-hidden rounded-2xl bg-white px-1.5 pt-1.5 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lift)]"
                  >
                    <ShirtPreview design={o.payload} copy={copyOf(o)} style={prefs.style} color={prefs.color} view="chest" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      ) : null}

      <TweakSheet option={top} open={tweaking} onClose={() => setTweaking(false)} />
    </div>
  );
}

/** "One at a time" or "Grid", on a laptop. Hands focus back so the arrow keys keep working. */
function BrowseMode({ grid, onChange }: { grid: boolean; onChange: (grid: boolean) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Browse">
      {[
        { on: false, label: 'One at a time' },
        { on: true, label: 'Grid' },
      ].map((m) => (
        <button
          key={m.label}
          role="radio"
          aria-checked={grid === m.on}
          onClick={(e) => {
            onChange(m.on);
            e.currentTarget.blur();
          }}
          className={`h-8 rounded-full px-3 text-sm font-medium ${grid === m.on ? 'bg-white shadow-sm' : 'text-ink/60'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Every design you haven't seen, at once, on a laptop. Arrow keys move the
 * highlight, L/M/P react, Enter opens, Z undoes; or hover a card.
 */
function BrowseGrid({
  deck,
  base,
  copyOf,
  mode,
  reactTo,
  canUndo,
  undo,
  passRest,
}: {
  deck: ShirtOption[];
  base: string;
  copyOf: (o: ShirtOption) => Copy;
  mode: ReactNode;
  reactTo: (o: ShirtOption, v: ReactionValue) => void;
  canUndo: boolean;
  undo: () => Promise<void>;
  passRest: () => Promise<void>;
}) {
  const [prefs] = usePrefs();
  const router = useRouter();
  const [focus, setFocus] = useState(0);
  const [passing, setPassing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const at = Math.min(focus, deck.length - 1);

  useEffect(() =>
    onShortcut((e) => {
      const o = deck[at];
      const cols = gridRef.current ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length : 4;
      const move = (to: number) => {
        const i = Math.min(Math.max(to, 0), deck.length - 1);
        setFocus(i);
        gridRef.current?.children[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      const keys: Record<string, () => void> = {
        ArrowRight: () => move(at + 1),
        ArrowLeft: () => move(at - 1),
        ArrowDown: () => move(at + cols),
        ArrowUp: () => move(at - cols),
        Enter: () => o && router.push(`${base}/o/${o.id}`),
        l: () => o && reactTo(o, 'love'),
        L: () => o && reactTo(o, 'love'),
        m: () => o && reactTo(o, 'maybe'),
        M: () => o && reactTo(o, 'maybe'),
        p: () => o && reactTo(o, 'pass'),
        P: () => o && reactTo(o, 'pass'),
        z: () => canUndo && void undo(),
        Z: () => canUndo && void undo(),
      };
      const run = keys[e.key];
      if (!run) return false;
      run();
      return true;
    }),
  );

  return (
    <div className="animate-pop">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{deck.length} to look at</span>
        {mode}
        <ViewButton />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {canUndo ? (
          <button onClick={undo} aria-label="Undo last swipe" className="inline-flex items-center gap-1.5 font-medium text-lagoon">
            <Icon name="undo" size={15} /> Undo
          </button>
        ) : null}
        <button
          onClick={async () => {
            setPassing(true);
            await passRest();
            setPassing(false);
          }}
          disabled={passing}
          className="font-medium text-muted underline underline-offset-4 disabled:opacity-50"
        >
          Pass on the rest
        </button>
        <span className="ml-auto text-xs text-muted">
          Keys: <Kbd>←</Kbd> <Kbd>→</Kbd> <Kbd>↑</Kbd> <Kbd>↓</Kbd> move · <Kbd>L</Kbd> love · <Kbd>M</Kbd> maybe · <Kbd>P</Kbd> pass · <Kbd>Enter</Kbd> open · <Kbd>Z</Kbd> undo
        </span>
      </div>
      <div ref={gridRef} className="grid grid-cols-4 gap-5 xl:grid-cols-5">
        {deck.map((o, i) => (
          <div
            key={o.id}
            onMouseEnter={() => setFocus(i)}
            className={`group relative overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] ${i === at ? 'ring-[3px] ring-lagoon' : ''}`}
          >
            <Link href={`${base}/o/${o.id}`} aria-label={describeDesign(o)} className="block bg-sand-2/60 px-3 pt-3">
              <ShirtPreview design={o.payload} copy={copyOf(o)} style={prefs.style} color={prefs.color} view={flatView(prefs.view)} />
            </Link>
            <div className={`absolute inset-x-0 bottom-3 transition ${i === at ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
              <ReactionButtons size="sm" keyHints onReact={(v) => reactTo(o, v)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const Kbd = ({ children }: { children: string }) => <kbd className="rounded-md bg-white px-1.5 font-sans ring-1 ring-line">{children}</kbd>;

function Stamp({ show, text, className, opacity }: { show: boolean; text: string; className: string; opacity: number }) {
  if (!show) return null;
  return (
    <div
      className={`pointer-events-none absolute top-8 rounded-xl border-[3px] px-3 py-1 font-display text-2xl font-semibold uppercase ${className}`}
      style={{ opacity }}
    >
      {text}
    </div>
  );
}
