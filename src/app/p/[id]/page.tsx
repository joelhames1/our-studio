'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { nameIn, useProject, otherName } from '@/components/ProjectProvider';
import { sharedCount } from '@/lib/engine/together';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { ShirtPreview } from '@/components/ShirtPreview';
import { BackPreview } from '@/components/BackPreview';
import { FactsSheet } from '@/components/FactsSheet';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { BottomBar, Button, LinkButton } from '@/components/ui';
import { usePrefs } from '@/lib/client/prefs';
import { vibe } from '@/lib/design/vibes';
import { GARMENT_STYLES, printPreset } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import { FinalSay } from '@/components/FinalSay';
import { useReopen } from '@/components/Reopen';

type Row = { href?: string; onClick?: () => void; icon: string; title: string; status: string; done?: boolean };

/** A list of rows, each a link (or a button) with a status line under its title. */
function Rows({ rows }: { rows: Row[] }) {
  const inner = (r: Row) => (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${r.done ? 'bg-lagoon text-white' : 'bg-sand-2 text-ink/70'}`}>
        <Icon name={r.done && r.icon !== 'heart' && r.icon !== 'cards' ? 'check' : r.icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{r.title}</span>
        <span className="block truncate text-sm text-muted">{r.status}</span>
      </span>
      <Icon name="chevronRight" className="text-ink/30" />
    </>
  );
  const row = 'flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-sand/60';
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      {rows.map((r, i) =>
        r.href ? (
          <Link key={r.title} href={r.href} className={`${row} ${i ? 'border-t border-line/70' : ''}`}>
            {inner(r)}
          </Link>
        ) : (
          <button key={r.title} type="button" onClick={r.onClick} className={`${row} ${i ? 'border-t border-line/70' : ''}`}>
            {inner(r)}
          </button>
        ),
      )}
    </div>
  );
}

export default function ProjectHub() {
  const { state, deck, matches, myReaction, backs, backMatches, members } = useProject();
  const [prefs] = usePrefs();
  const { project } = state;
  const base = `/p/${project.id}`;
  const [details, setDetails] = useState(false);
  const approved = project.status === 'approved' && state.decision;

  if (approved) return <ApprovedHub />;

  const hearts = state.options.filter((o) => myReaction(o.id) === 'love');
  const featured = matches[0] ?? hearts[0] ?? state.options.find((o) => o.source === 'seed') ?? state.options[0];
  const vibes = project.brief.vibes.map((v) => vibe(v)?.name).filter(Boolean);
  const copy = project.brief.copy;
  const when = state.facts.dates;

  const journey: Row[] = [
    {
      href: `${base}/browse`,
      icon: 'cards',
      title: 'Browse designs',
      status: deck.length ? `${deck.length} waiting for you` : 'All caught up. Ask for fresh ideas any time.',
      done: deck.length === 0,
    },
    {
      href: `${base}/favorites`,
      icon: 'heart',
      title: 'Favorites',
      status: matches.length
        ? members <= 2
          ? `${matches.length} you and ${otherName(state)} both love`
          : sharedCount(matches.length, members)
        : hearts.length
          ? `${hearts.length} you love so far`
          : 'Nothing loved yet',
      done: matches.length > 0,
    },
    {
      href: `${base}/back`,
      icon: 'shirt',
      title: 'Back print',
      status: backMatches.length ? sharedCount(backMatches.length, members) : `${backs.length} ideas for the back, or leave it plain`,
      done: backMatches.length > 0,
    },
    {
      href: `${base}/approve`,
      icon: 'check',
      title: 'Pick the final',
      status: state.canApprove ? 'When you have the one' : `${state.approverName} makes the final call`,
    },
  ];

  const tune: Row[] = [
    { href: `${base}/words`, icon: 'type', title: 'The words', status: [copy.headline, copy.tagline].filter(Boolean).join(' · ') },
    { href: `${base}/vibe`, icon: 'palette', title: 'Style', status: vibes.length ? vibes.join(', ') : 'Any style. Narrow it to the looks you like.' },
    { onClick: () => setDetails(true), icon: 'users', title: 'Details for the back', status: 'Names, dates and numbers the backs use' },
  ];

  return (
    <div className="animate-pop lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-b from-lagoon-soft to-sand-2 px-12 pt-6 shadow-[var(--shadow-card)] lg:sticky lg:top-32 lg:mb-0">
        {featured ? <ShirtPreview design={featured.payload} copy={featured.payload.copyOverride ?? copy} style={prefs.style} color={prefs.color} /> : null}
      </div>

      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold">Let&apos;s make the shirt</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {when ? `${when}. ` : ''}
          {members === 1
            ? 'Love the ones you like. Invite people from Household, and the ones you all love float to the top.'
            : `Love the ones you like; ${members === 2 ? 'the ones you both love' : 'the ones more of you love'} float to the top.`}
        </p>

        <div className="mt-5">
          <Rows rows={journey} />
        </div>

        <FinalSay className="mt-4" />

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wider text-muted">Make it yours</h2>
        <Rows rows={tune} />

        <ProjectLinks />

        <BottomBar>
          <LinkButton href={deck.length ? `${base}/browse` : `${base}/favorites`} size="lg" className="w-full" icon="heart">
            {deck.length ? 'Start browsing' : 'See favorites'}
          </LinkButton>
        </BottomBar>
      </div>
      <FactsSheet open={details} onClose={() => setDetails(false)} />
    </div>
  );
}

/**
 * The project once it's approved: the shirt that was chosen, and the way to
 * the print files. Browsing and voting step aside until it's reopened.
 */
function ApprovedHub() {
  const { state } = useProject();
  const { reopen, busy } = useReopen();
  const decision = state.decision!;
  const snap = decision.snapshot;
  const base = `/p/${state.project.id}`;
  const preset = printPreset(snap.preset);
  const total = snap.sizes.reduce((a, s) => a + s.qty, 0);
  const style = GARMENT_STYLES.find((g) => g.id === snap.garment)?.name ?? 'Shirt';
  const ready = decision.status === 'ready';
  return (
    <div className="animate-pop lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
      <div className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-b from-lagoon-soft to-sand-2 px-4 pt-4 shadow-[var(--shadow-card)] lg:sticky lg:top-32 lg:mb-0">
        {snap.back ? (
          <div className="grid grid-cols-2 gap-2 pb-2">
            <ShirtPreview design={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" printWidthIn={preset.widthIn} placement={preset.placement} label="Front" />
            <BackPreview back={snap.back.design} facts={snap.back.facts} front={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" wearer={snap.back.names[0]} label="Back" />
          </div>
        ) : (
          <ShirtPreview design={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" printWidthIn={preset.widthIn} placement={preset.placement} />
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-lagoon">
          {decision.approvedBy === state.me.id ? 'You picked it' : `${nameIn(state, decision.approvedBy)} picked it`}
        </div>
        <h1 className="font-display text-[28px] leading-tight font-semibold sm:text-[34px]">It&apos;s the one!</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {style} in {garmentColor(snap.color).name.toLowerCase()} · {total} shirt{total === 1 ? '' : 's'}
          {snap.back ? ' · front and back' : ''}. {ready ? 'The print files are ready.' : decision.status === 'failed' ? 'The print files need another try.' : 'The print files are being made.'}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <LinkButton href={`${base}/done`} size="lg" icon="download">
            Get the print files
          </LinkButton>
          {ready ? (
            <LinkButton href={`${base}/done?send=1`} size="lg" variant="secondary" icon="send">
              Send to a print shop
            </LinkButton>
          ) : null}
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 text-[15px] shadow-[var(--shadow-card)]">
          <p className="font-medium">Want to change it?</p>
          {state.canApprove ? (
            <>
              <p className="mt-1 text-muted">Reopening sets these print files aside so everyone can keep choosing.</p>
              <Button variant="secondary" size="sm" className="mt-3" icon="undo" onClick={reopen} busy={busy}>
                Reopen and keep choosing
              </Button>
            </>
          ) : (
            <p className="mt-1 text-muted">It&apos;s locked in while the shirts get made. {state.approverName} has the final say and can reopen it.</p>
          )}
        </div>

        <ProjectLinks />
      </div>
    </div>
  );
}

/** Rename, the project's activity, and archiving, at the foot of the project page. */
function ProjectLinks() {
  const { state, setState } = useProject();
  const { project } = state;
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const canArchive = state.canManage && !project.archived;

  const archive = async () => {
    if (!confirm(`Archive “${project.title}”? It moves off the home screen into Archived, and you can restore it any time.`)) return;
    setArchiving(true);
    try {
      await http(`/api/projects/${project.id}/archive`, { body: {} });
      router.push('/');
    } catch (e) {
      toast((e as Error).message, 'error');
      setArchiving(false);
    }
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
        <button onClick={() => setRenaming(true)} className="underline underline-offset-4">
          Rename
        </button>
        <Link href={`/activity?project=${encodeURIComponent(project.id)}`} className="underline underline-offset-4">
          Activity
        </Link>
        {canArchive ? (
          <button onClick={archive} disabled={archiving} className="underline underline-offset-4">
            {archiving ? 'Archiving…' : 'Archive this project'}
          </button>
        ) : null}
      </div>
      <RenameSheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title={project.title}
        onSaved={(title) => {
          setState({ ...state, project: { ...project, title } });
          setRenaming(false);
          router.refresh();
        }}
        projectId={project.id}
      />
    </>
  );
}

/** A new name, so two "Maya's 40th" projects can be told apart. */
function RenameSheet({ open, onClose, title, projectId, onSaved }: { open: boolean; onClose: () => void; title: string; projectId: string; onSaved: (title: string) => void }) {
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await http<{ title: string }>(`/api/projects/${projectId}/rename`, { body: { title: value } });
      toast(`Renamed to “${res.title}”`);
      onSaved(res.title);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Rename this project">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        maxLength={60}
        autoFocus
        aria-label="Project name"
        className="w-full rounded-2xl bg-white px-4 py-3 text-[17px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
      />
      <Button size="lg" className="mb-2 mt-4 w-full" icon="check" onClick={save} busy={busy} disabled={!value.trim() || value.trim() === title}>
        Save the name
      </Button>
    </Sheet>
  );
}
