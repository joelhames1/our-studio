'use client';
import Link from 'next/link';
import { compareHref, setCompare, toggleCompare, useCompare } from '@/lib/client/compare';
import { useDesktop } from '@/lib/client/media';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';
import { toast } from './Toast';
import { Button } from './ui';

/** On a laptop, once anything's picked: the way into the comparison. */
export function ComparePill() {
  const { state } = useProject();
  const pid = state.project.id;
  const ids = useCompare(pid);
  if (!ids.length) return null;
  return (
    <div className="fixed bottom-8 right-8 z-30 hidden items-center gap-1 rounded-full bg-ink p-1.5 text-white shadow-[var(--shadow-lift)] lg:flex">
      {ids.length < 2 ? (
        <span className="px-3 text-sm">Pick one more to compare</span>
      ) : (
        <Link href={compareHref(pid, ids)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium hover:bg-white/10">
          Compare {ids.length} <Icon name="chevronRight" size={16} />
        </Link>
      )}
      <button onClick={() => setCompare(pid, [])} aria-label="Clear the comparison" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

/** Picks a design to compare, or puts it back. */
export function compareToggle(projectId: string, id: string) {
  if (!toggleCompare(projectId, id)) toast('Up to four at a time. Take one out first.');
}

/** "Add to compare" on a design's own page (laptop only). */
export function CompareButton({ optionId }: { optionId: string }) {
  const { state } = useProject();
  const desktop = useDesktop();
  const picked = useCompare(state.project.id).includes(optionId);
  if (!desktop) return null;
  return (
    <Button variant={picked ? 'primary' : 'secondary'} icon={picked ? 'check' : 'grid'} onClick={() => compareToggle(state.project.id, optionId)} aria-pressed={picked}>
      {picked ? 'Picked to compare' : 'Add to compare'}
    </Button>
  );
}
