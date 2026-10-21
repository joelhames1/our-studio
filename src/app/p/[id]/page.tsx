'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProject, otherName } from '@/components/ProjectProvider';
import { sharedCount } from '@/lib/engine/together';
import { backTemplate } from '@/lib/design/back/templates';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { ShirtPreview } from '@/components/ShirtPreview';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { BottomBar, Button, LinkButton } from '@/components/ui';
import { usePrefs } from '@/lib/client/prefs';
import { vibe } from '@/lib/design/vibes';
import { FinalSay } from '@/components/FinalSay';

export default function ProjectHub() {
  const { state, setState, deck, matches, myReaction, backs, backMatches, members } = useProject();
  const [prefs] = usePrefs();
  const { project, me } = state;
  const base = `/p/${project.id}`;
  const hearts = state.options.filter((o) => myReaction(o.id) === 'love');
  const featured = matches[0] ?? hearts[0] ?? state.options.find((o) => o.source === 'seed') ?? state.options[0];
  const vibes = project.brief.vibes.map((v) => vibe(v)?.name).filter(Boolean);
  const copy = project.brief.copy;
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const canArchive = state.canManage && !project.archived;
  const when = state.facts.dates;

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

  const steps = [
    {
      href: `${base}/vibe`,
      icon: 'palette',
      title: 'Pick a vibe',
      status: vibes.length ? vibes.join(', ') : 'Optional. Narrow things down to the styles you like.',
      done: vibes.length > 0,
    },
    {
      href: `${base}/words`,
      icon: 'type',
      title: 'The words',
      status: `${copy.headline} · ${copy.tagline}`,
      done: true,
    },
    {
      href: `${base}/browse`,
      icon: 'heart',
      title: 'Browse designs',
      status: deck.length ? `${deck.length} waiting for you` : 'All caught up. Ask for fresh ideas any time.',
      done: deck.length === 0,
    },
    {
      href: `${base}/back`,
      icon: 'shirt',
      title: 'The back',
      status: backMatches.length
        ? sharedCount(backMatches.length, members)
        : `${backs.length} ideas, like ${[...new Set(backs.map((b) => backTemplate(b.payload.template).name))].slice(0, 3).join(', ')}`,
      done: backMatches.length > 0,
    },
    {
      href: `${base}/favorites`,
      icon: 'star',
      title: 'Favorites',
      status: matches.length
        ? members <= 2
          ? `${matches.length} you and ${otherName(state)} both love`
          : sharedCount(matches.length, members)
        : hearts.length
          ? `${hearts.length} hearted so far`
          : 'Nothing hearted yet',
      done: matches.length > 0,
    },
    {
      href: project.status === 'approved' ? `${base}/done` : `${base}/approve`,
      icon: 'check',
      title: project.status === 'approved' ? 'Approved!' : 'Approve the final',
      status: project.status === 'approved' ? 'Print files are ready' : state.canApprove ? 'When you have the one' : `${state.approverName} makes the final call`,
      done: project.status === 'approved',
    },
  ];

  return (
    <div className="animate-pop lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-b from-lagoon-soft to-sand-2 px-12 pt-6 shadow-[var(--shadow-card)] lg:sticky lg:top-32 lg:mb-0">
        {featured ? (
          <ShirtPreview design={featured.payload} copy={featured.payload.copyOverride ?? copy} style={prefs.style} color={prefs.color} />
        ) : null}
      </div>

      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold">Let&apos;s make the shirt</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {when ? `${when}. ` : ''}
          {members === 1
            ? 'Heart the ones you like. Invite people from Household, and the ones you all love float to the top.'
            : `Heart the ones you like; ${members === 2 ? 'the ones you both love' : 'the ones more of you love'} float to the top.`}
        </p>

        <div className="mt-5 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
          {steps.map((s, i) => (
            <Link key={s.title} href={s.href} className={`flex items-center gap-4 px-4 py-4 hover:bg-sand/60 ${i ? 'border-t border-line/70' : ''}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${s.done ? 'bg-lagoon text-white' : 'bg-sand-2 text-ink/70'}`}>
                <Icon name={s.done && s.icon !== 'heart' ? 'check' : s.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="block truncate text-sm text-muted">{s.status}</span>
              </span>
              <Icon name="chevronRight" className="text-ink/30" />
            </Link>
          ))}
        </div>

        <FinalSay className="mt-4" />

        <div className="mt-6 flex justify-center gap-5 text-sm text-muted">
          <button onClick={() => setRenaming(true)} className="underline underline-offset-4">
            Rename
          </button>
          <Link href={`/activity?project=${encodeURIComponent(project.id)}`} className="underline underline-offset-4">
            History
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

        <BottomBar>
          <LinkButton href={deck.length ? `${base}/browse` : `${base}/favorites`} size="lg" className="w-full" icon={deck.length ? 'heart' : 'star'}>
            {deck.length ? 'Start browsing' : 'See favorites'}
          </LinkButton>
        </BottomBar>
      </div>
    </div>
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
