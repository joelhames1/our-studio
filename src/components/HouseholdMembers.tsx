'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { http } from '@/lib/client/http';
import { toast } from './Toast';
import { Button, Pill } from './ui';

export interface MemberRow {
  id: string;
  name: string;
  role: 'owner' | 'member';
  /** Shown to owners, and to the person themselves. */
  email?: string | null;
  /** Runs the site: can't be taken out by anyone else. */
  admin: boolean;
}

/** Everyone in the household; owners can change who owns it and take people out. */
export function HouseholdMembers({ members, me, owner }: { members: MemberRow[]; me: string; owner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const owners = members.filter((m) => m.role === 'owner').length;

  const act = async (m: MemberRow, action: 'owner' | 'member' | 'remove') => {
    setBusy(true);
    try {
      await http('/api/household/members', { body: { person: m.id, action } });
      toast(action === 'remove' ? `${m.name} is out of the household` : `${m.id === me ? 'You’re' : `${m.name} is`} ${action === 'owner' ? 'an owner' : 'a member'} now`);
      setOpen(null);
      setConfirm(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      {members.map((m) => {
        const self = m.id === me;
        // Owners manage everyone else; anyone who owns it can step down while another owner remains.
        const manageable = owner && (!self || (m.role === 'owner' && owners > 1));
        return (
          <li key={m.id} className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lagoon-soft font-semibold text-lagoon-deep" aria-hidden>
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">
                  {m.name}
                  {self ? <span className="font-normal text-muted"> (you)</span> : null}
                </span>
                {m.email !== undefined ? <span className="block truncate text-sm text-muted">{m.email ?? 'No sign-in address yet'}</span> : null}
              </span>
              {m.role === 'owner' ? <Pill>Owner</Pill> : null}
              {manageable ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(open === m.id ? null : m.id);
                    setConfirm(false);
                  }}
                  className="shrink-0 text-sm text-muted underline underline-offset-4"
                  aria-expanded={open === m.id}
                  aria-label={`Change ${self ? 'your' : `${m.name}’s`} place in the household`}
                >
                  {open === m.id ? 'Close' : 'Change'}
                </button>
              ) : null}
            </div>
            {open === m.id ? (
              <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                {m.role === 'member' ? (
                  <Button size="sm" variant="secondary" onClick={() => act(m, 'owner')} busy={busy}>
                    Make an owner
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => act(m, 'member')} busy={busy} disabled={owners < 2}>
                    {self ? 'Step down as owner' : 'Make a member'}
                  </Button>
                )}
                {!self && !m.admin ? (
                  confirm ? (
                    <>
                      <Button size="sm" variant="coral" onClick={() => act(m, 'remove')} busy={busy}>
                        Yes, take {m.name} out
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                        Keep them
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                      Take out of the household
                    </Button>
                  )
                ) : null}
                {confirm ? (
                  <p className="w-full text-sm text-muted">
                    {m.name} stops seeing the household’s projects. What they made stays, their hearts stop counting, and anything they had the final say on passes to you. Nothing is deleted: they’ll be under Past members, and you can invite them back.
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Leaving the household, with a second tap to be sure. */
export function LeaveHousehold({ name, only }: { name: string; only: boolean }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leave = async () => {
    setBusy(true);
    setError('');
    try {
      await http('/api/household/leave', { body: {} });
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="text-sm">
      {sure ? (
        <div className="rounded-2xl bg-coral-soft/60 p-4">
          <p className="text-[15px] text-ink">
            Leave {name}? You’ll stop seeing its projects{only ? ', and since it’s your only household you’ll be signed out' : ''}. Getting back in takes a new invite.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="coral" onClick={leave} busy={busy}>
              Leave
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
              Stay
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setSure(true)} className="text-muted underline underline-offset-4">
          Leave the household
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** For people in more than one household: which one you're working in. */
export function SwitchHousehold({ households, current }: { households: { id: string; name: string; role: string }[]; current: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (id: string) => {
    setBusy(id);
    try {
      await http('/api/household/switch', { body: { household: id } });
      window.location.assign('/');
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(null);
    }
  };
  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      {households.map((h) => (
        <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0 truncate text-[15px]">
            <span className="font-medium">{h.name}</span>
            <span className="text-muted"> · {h.role === 'owner' ? 'owner' : 'member'}</span>
          </span>
          {h.id === current ? (
            <span className="text-sm text-lagoon-deep">Working in it</span>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => go(h.id)} busy={busy === h.id}>
              Switch to it
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
