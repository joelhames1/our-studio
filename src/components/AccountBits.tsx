'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { http } from '@/lib/client/http';
import { toast } from './Toast';
import { Button } from './ui';

const field = 'h-11 min-w-0 flex-1 rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon';

/** The name everyone sees for you, changeable in place. */
export function AccountName({ name, canRename }: { name: string; canRename: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState(name);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await http<{ name: string }>('/api/account/name', { body: { name: value } });
      setShown(r.name);
      setValue(r.name);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };
  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-display text-[30px] leading-tight font-semibold">{shown}</h1>
        {canRename ? (
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted underline underline-offset-4">
            Change your name
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <form onSubmit={save} className="mt-2">
      <label htmlFor="account-name" className="sr-only">
        Your name
      </label>
      <div className="flex gap-2">
        <input id="account-name" value={value} maxLength={40} autoFocus required onChange={(e) => setValue(e.target.value)} className={field} />
        <Button type="submit" busy={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export interface DeviceRow {
  id: string;
  device: string;
  via: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return 'in the last hour';
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days < 45 ? `${days} day${days === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Where you're signed in, with a way to sign any other browser out, or all of them. */
export function Devices({ devices }: { devices: DeviceRow[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const list = devices.filter((d) => !gone.includes(d.id));
  const others = list.filter((d) => !d.current);

  const out = async (d: DeviceRow) => {
    setBusy(d.id);
    try {
      await http('/api/account/devices', { body: { action: 'sign-out', id: d.id } });
      setGone((g) => [...g, d.id]);
      toast(`Signed out on ${d.device}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(null);
  };
  const everywhere = async () => {
    setBusy('all');
    try {
      await http('/api/account/devices', { body: { action: 'everywhere' } });
      setGone(others.map((d) => d.id));
      setSure(false);
      toast('Signed out everywhere else');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
        {list.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">
                {d.device}
                {d.current ? <span className="font-normal text-lagoon-deep"> · this one</span> : null}
              </span>
              <span className="block text-sm text-muted">
                Signed in {day(d.createdAt)} with {d.via} · used {d.current ? 'now' : ago(d.lastSeenAt)}
              </span>
            </span>
            {!d.current ? (
              <Button size="sm" variant="secondary" onClick={() => out(d)} busy={busy === d.id}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
        {!list.length ? <li className="px-4 py-3 text-[15px] text-muted">None listed yet: browsers join the list as they sign in.</li> : null}
      </ul>
      {sure ? (
        <div className="rounded-2xl bg-sand-2/70 p-4">
          <p className="text-[15px]">Sign out every other phone and computer, including any signed in before this list existed? This one stays signed in.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={everywhere} busy={busy === 'all'}>
              Sign them out
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" icon="key" onClick={() => setSure(true)}>
          Sign out everywhere else
        </Button>
      )}
    </div>
  );
}

/**
 * Closing your account, with the word typed out to be sure. Closed is
 * reversible; erasing (optional, plainly explained) happens 30 days later.
 */
export function CloseAccount({ word, days, alone }: { word: string; days: number; alone: string[] }) {
  const [open, setOpen] = useState(false);
  const [erase, setErase] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await http('/api/account/close', { body: { confirm: typed, erase } });
      window.location.assign(`/?signin=closed`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <Button variant="ghost" icon="archive" onClick={() => setOpen(true)}>
        Close my account
      </Button>
    );
  }
  return (
    <form onSubmit={go} className="space-y-3 rounded-3xl bg-sand-2/70 p-4">
      <p className="text-[15px] font-medium">When you close your account:</p>
      <ul className="list-disc space-y-1 pl-5 text-[15px]">
        <li>you’re signed out everywhere and can’t sign in</li>
        <li>you leave every household; anything you had the final say on passes to its owner, and your hearts stop counting</li>
        <li>your name stays on what you did, and everything you made with others stays with them</li>
        <li>nothing is deleted: to come back, ask someone in one of your households for a new invite, or ask whoever runs the site</li>
      </ul>
      <label className="flex items-start gap-3 rounded-2xl bg-white p-3 text-[15px] ring-1 ring-line">
        <input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} className="mt-1 h-4 w-4 accent-coral" />
        <span>
          <span className="font-medium">Also erase my data in {days} days.</span> Then your name, address, sign-ins, hearts, maybes and passes are deleted for good
          {alone.length ? (
            <>
              , and so is {alone.join(' and ')} with every project, design and print file in {alone.length === 1 ? 'it' : 'them'}, since nobody else is in{' '}
              {alone.length === 1 ? 'it' : 'them'}
            </>
          ) : null}
          . Until then it’s only closed, and whoever runs the site can stop it if you change your mind. Nightly backups keep a copy for {days} more days after that.
        </span>
      </label>
      <label htmlFor="close-word" className="block text-sm font-medium">
        Type “{word}” to close your account
      </label>
      <div className="flex gap-2">
        <input id="close-word" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} className={field} />
        <Button type="submit" variant={erase ? 'coral' : 'primary'} busy={busy} disabled={typed.trim().toLowerCase() !== word}>
          {erase ? 'Close and erase later' : 'Close it'}
        </Button>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted underline underline-offset-4">
        Keep my account open
      </button>
      {error ? (
        <p role="alert" className="rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </form>
  );
}
