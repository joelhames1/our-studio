'use client';
import { useState, useSyncExternalStore } from 'react';
import type { UserId } from '@/lib/engine/types';
import { http } from '@/lib/client/http';
import { Icon } from './Icon';
import { nameIn, useProject } from './ProjectProvider';
import { toast } from './Toast';
import { Button } from './ui';
import { allOfYou } from '@/lib/engine/together';

const never = () => () => {};
const day = (iso: string, time: boolean, timeZone?: string) => {
  const d = new Date(iso);
  const thisYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }), timeZone });
  return time ? `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}` : date;
};

/**
 * A date in the reader's own time zone (UTC while the page is still loading, so
 * it hydrates cleanly). `time` adds the time of day, for telling apart things made the same day.
 */
export function When({ iso, time = false }: { iso: string; time?: boolean }) {
  const text = useSyncExternalStore(
    never,
    () => day(iso, time),
    () => day(iso, time, 'UTC'),
  );
  return <time dateTime={iso}>{text}</time>;
}

/** "you", or their name. */
export function useWho(): (id: UserId | undefined) => string {
  const { state } = useProject();
  return (id) => (id === state.me.id ? 'you' : nameIn(state, id));
}

/** Archives or restores one design (front or back), with a toast either way. */
export function useDesignArchive(optionId: string) {
  const { setArchived, members } = useProject();
  const [busy, setBusy] = useState(false);
  const run = async (archived: boolean) => {
    setBusy(true);
    try {
      await setArchived(optionId, archived);
      toast(archived ? `Archived for ${allOfYou(members)}. It’s under Archived in Favorites.` : 'Restored. It’s back in Favorites and Browse.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, archive: () => run(true), restore: () => run(false) };
}

/** Shown on an archived design's own page. */
export function ArchivedNote({ at, by, what, busy, onRestore }: { at: string; by: UserId; what: string; busy: boolean; onRestore: () => void }) {
  const who = useWho();
  const { members } = useProject();
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c] lg:mt-0">
      <Icon name="archive" size={20} className="shrink-0" />
      <p className="flex-1">
        Archived <When iso={at} /> by {who(by)}. This {what} is out of Browse and Favorites for {allOfYou(members)}.
      </p>
      <Button size="sm" onClick={onRestore} busy={busy} icon="undo">
        Restore
      </Button>
    </div>
  );
}

/** Across the top of an archived project's pages: when, by whom, and the way back. */
export function ArchivedProjectBanner() {
  const { state, refresh } = useProject();
  const who = useWho();
  const [busy, setBusy] = useState(false);
  const { project } = state;
  if (!project.archived) return null;
  const restore = async () => {
    setBusy(true);
    try {
      await http(`/api/projects/${project.id}/restore`, { body: {} });
      await refresh();
      toast('Restored. It’s back on the home screen.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="mb-5 flex items-center gap-3 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
      <Icon name="archive" size={20} className="shrink-0" />
      <p className="flex-1">
        Archived{project.archivedAt ? <> <When iso={project.archivedAt} /></> : null}
        {project.archivedBy ? ` by ${who(project.archivedBy)}` : ''}. It&apos;s off the home screen
        {state.canManage ? '' : `; ${nameIn(state, project.createdBy) === 'Someone' ? 'the household’s owner' : nameIn(state, project.createdBy)} can restore it`}.
      </p>
      {state.canManage ? (
        <Button size="sm" onClick={restore} busy={busy} icon="undo">
          Restore
        </Button>
      ) : null}
    </div>
  );
}
