'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Copy, ShirtDesign } from '@/lib/design/types';
import { http } from '@/lib/client/http';
import type { Shirt } from '@/lib/server/overview';
import { When } from './ArchiveBits';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { ShirtPreview } from './ShirtPreview';
import { toast } from './Toast';
import { Button, Pill } from './ui';
import { sharedCount } from '@/lib/engine/together';

export interface ArchivedRow {
  id: string;
  title: string;
  /** "Birthday", "Trip"… */
  kind: string;
  approved: boolean;
  copy: Copy;
  pick: { design: ShirtDesign } | null;
  /** The shirt it was approved on, or a plain white tee. */
  shirt: Shirt;
  total: number;
  matches: number;
  startedAt: string;
  startedBy: string;
  archivedAt: string;
  archivedBy: string | null;
  canRestore: boolean;
  /** Why it can't be deleted, if it can't. */
  keep: string | null;
}

/** The archive: enough on each row (picture, dates, who) to tell same-named projects apart. */
export function ArchivedList({ rows, members }: { rows: ArchivedRow[]; members: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ArchivedRow | null>(null);

  const restore = async (row: ArchivedRow) => {
    setBusy(row.id);
    try {
      await http(`/api/projects/${row.id}/restore`, { body: {} });
      toast(`“${row.title}” is back on the home screen.`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  // Same name twice: the time of day tells them apart.
  const named = new Map<string, number>();
  for (const r of rows) named.set(r.title.trim().toLowerCase(), (named.get(r.title.trim().toLowerCase()) ?? 0) + 1);
  const twin = (r: ArchivedRow) => (named.get(r.title.trim().toLowerCase()) ?? 0) > 1;

  if (!rows.length) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center text-muted shadow-[var(--shadow-card)]">
        Nothing archived. Archive a project from the bottom of its page.
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-4 rounded-3xl bg-white p-3 shadow-[var(--shadow-card)] lg:items-center lg:p-4">
            <Link href={`/p/${r.id}`} className="flex h-24 w-20 shrink-0 items-center overflow-hidden rounded-2xl bg-sand-2/60" aria-label={`Open ${r.title}`}>
              {r.pick ? <ShirtPreview design={r.pick.design} copy={r.pick.design.copyOverride ?? r.copy} style={r.shirt.style} color={r.shirt.color} view="art" /> : null}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/p/${r.id}`} className="font-display text-lg font-semibold leading-tight hover:underline">
                  {r.title}
                </Link>
                <Pill tone="muted">{r.kind}</Pill>
                {r.approved ? <Pill tone="lagoon">Approved</Pill> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                Started <When iso={r.startedAt} time={twin(r)} /> by {r.startedBy} · archived <When iso={r.archivedAt} time={twin(r)} />
                {r.archivedBy ? ` by ${r.archivedBy}` : ''}
              </p>
              <p className="text-sm text-muted">
                {r.total} design{r.total === 1 ? '' : 's'}
                {r.matches ? ` · ${sharedCount(r.matches, members)}` : ''}
              </p>
              {r.canRestore ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button size="sm" icon="undo" onClick={() => restore(r)} busy={busy === r.id}>
                    Restore
                  </Button>
                  {r.keep ? (
                    <span className="text-xs text-muted">{r.keep}</span>
                  ) : (
                    <button onClick={() => setDeleting(r)} className="px-2 text-sm font-medium text-coral underline-offset-4 hover:underline">
                      Delete for good
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <DeleteSheet row={deleting} members={members} onClose={() => setDeleting(null)} onDeleted={() => router.refresh()} />
    </>
  );
}

/** Typing the name is the "are you sure": there's no undo. */
function DeleteSheet({ row, members, onClose, onDeleted }: { row: ArchivedRow | null; members: number; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const match = typed.trim().toLowerCase() === row.title.trim().toLowerCase();
  const close = () => {
    setTyped('');
    onClose();
  };
  const remove = async () => {
    setBusy(true);
    try {
      await http(`/api/projects/${row.id}/delete`, { body: { confirm: typed } });
      toast(`“${row.title}” is deleted.`);
      close();
      onDeleted();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={close} title="Delete for good?">
      <div className="space-y-3 text-[15px]">
        <p>
          This removes <span className="font-semibold">{row.title}</span> completely: its {row.total} design{row.total === 1 ? '' : 's'}, {members <= 2 ? 'both of your' : 'everyone’s'}
          hearts, any artwork made for it and any print files. It can&apos;t be undone.
        </p>
        <p className="text-muted">Type the project&apos;s name to confirm.</p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          aria-label="Project name to confirm"
          placeholder={row.title}
          className="w-full rounded-2xl bg-white px-4 py-3 text-[17px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-coral"
        />
      </div>
      <Button variant="coral" size="lg" icon="x" className="mb-2 mt-4 w-full" onClick={remove} busy={busy} disabled={!match}>
        Delete it for good
      </Button>
      <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Icon name="info" size={13} /> Changed your mind? Restore keeps everything instead.
      </p>
    </Sheet>
  );
}
