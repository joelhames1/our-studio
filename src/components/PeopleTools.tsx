'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { http } from '@/lib/client/http';
import type { PersonRow } from '@/lib/server/account';
import { toast } from './Toast';
import { Button, Pill } from './ui';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const field = 'h-10 min-w-0 flex-1 rounded-2xl bg-white px-3 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon';

async function act(body: object, done: string, router: ReturnType<typeof useRouter>): Promise<boolean> {
  try {
    await http('/api/admin/people', { body });
    toast(done);
    router.refresh();
    return true;
  } catch (e) {
    toast((e as Error).message, 'error');
    return false;
  }
}

/** One person on Setup → People, with what Joel can do about their account. */
export function PersonCard({ p }: { p: PersonRow }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'off' | 'erase'>('idle');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (body: object, done: string) => {
    setBusy(true);
    if (await act({ person: p.id, ...body }, done, router)) {
      setMode('idle');
      setTyped('');
    }
    setBusy(false);
  };
  const erase = (e: FormEvent) => {
    e.preventDefault();
    void run({ action: 'erase', confirm: typed }, `${p.name}’s account is erased`);
  };

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          <span className="text-[15px] font-medium">{p.name}</span>
          {p.admin ? <span className="text-muted"> (you)</span> : null}
          <span className="block truncate text-sm text-muted">{p.email ?? 'No sign-in address'}</span>
        </span>
        {p.status === 'open' ? null : <Pill>{p.status === 'closed' ? 'Closed' : 'Switched off'}</Pill>}
      </div>
      <p className="mt-1 text-sm text-muted">
        {p.households.length ? p.households.map((h) => `${h.name}${h.role === 'owner' ? ' (owner)' : ''}`).join(' · ') : 'In no household'}
        {p.lastSeen && p.status === 'open' ? ` · last seen ${day(p.lastSeen)}` : ''}
        {p.archivedAt ? ` · ${p.status === 'closed' ? 'closed' : 'switched off'} ${day(p.archivedAt)}` : ''}
      </p>
      {p.eraseAfter ? (
        <p className="mt-1 text-sm text-coral">
          Their data will be erased on {day(p.eraseAfter)}{p.status === 'closed' ? ', as they asked' : ''}.
        </p>
      ) : null}

      {p.admin ? null : mode === 'idle' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.status === 'open' ? (
            <Button size="sm" variant="ghost" onClick={() => setMode('off')}>
              Switch off
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => run({ action: 'restore' }, `${p.name}’s account is open again`)} busy={busy}>
                Restore
              </Button>
              {p.eraseAfter ? (
                <Button size="sm" variant="secondary" onClick={() => run({ action: 'keep' }, `${p.name}’s data will be kept`)} busy={busy}>
                  Keep their data
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setMode('erase')}>
                Erase now
              </Button>
            </>
          )}
        </div>
      ) : mode === 'off' ? (
        <div className="mt-3 rounded-2xl bg-sand-2/70 p-3 text-[15px]">
          <p>
            Switch off {p.name}? They’re signed out everywhere, can’t sign in, and leave their households (the final say passes to an owner). Nothing is
            deleted, an invite won’t bring them back, and you can restore them here.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="coral" onClick={() => run({ action: 'switch-off' }, `${p.name}’s account is switched off`)} busy={busy}>
              Switch off
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={erase} className="mt-3 space-y-2 rounded-2xl bg-coral-soft/60 p-3 text-[15px]">
          <p>
            Erase {p.name} for good? Their name, address, sign-ins, devices, hearts, maybes and passes go, and so does any household nobody else could come back
            to, with its projects and files. What they made with others stays. Last night’s backup still has them for 30 days.
          </p>
          <label htmlFor={`erase-${p.id}`} className="block text-sm font-medium">
            Type “{p.name}” to erase
          </label>
          <div className="flex gap-2">
            <input id={`erase-${p.id}`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} className={field} />
            <Button size="sm" type="submit" variant="coral" busy={busy} disabled={typed.trim().toLowerCase() !== p.name.trim().toLowerCase()}>
              Erase
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/** A household nobody's in any more, which Joel can erase with its name typed out. */
export function EmptyHousehold({ h }: { h: { id: string; name: string; createdAt: string; projects: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const erase = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await act({ action: 'erase-household', household: h.id, confirm: typed }, `${h.name} is erased`, router);
    setBusy(false);
  };
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px]">
          <span className="font-medium">{h.name}</span>
          <span className="text-muted">
            {' '}
            · {h.projects} project{h.projects === 1 ? '' : 's'} · started {day(h.createdAt)}
          </span>
        </span>
        {!open ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            Erase
          </Button>
        ) : null}
      </div>
      {open ? (
        <form onSubmit={erase} className="mt-3 space-y-2 rounded-2xl bg-coral-soft/60 p-3 text-[15px]">
          <p>Erase {h.name} for good, with every project, design and print file in it? Anyone whose account closed while in it can’t be restored into it.</p>
          <label htmlFor={`erase-h-${h.id}`} className="block text-sm font-medium">
            Type “{h.name}” to erase
          </label>
          <div className="flex gap-2">
            <input id={`erase-h-${h.id}`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} className={field} />
            <Button size="sm" type="submit" variant="coral" busy={busy} disabled={typed.trim().toLowerCase() !== h.name.trim().toLowerCase()}>
              Erase
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
