'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { http } from '@/lib/client/http';
import { toast } from './Toast';
import { Button } from './ui';

export interface OpenInvite {
  id: string;
  name: string;
  householdName?: string;
  expiresAt: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const field = 'h-11 w-full rounded-2xl bg-white px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon';

/**
 * Making invite links and keeping track of the ones still waiting. "member"
 * invites someone into your household; "household" (Setup) invites someone to
 * start their own. A link is shown once: only a hash of it is kept.
 */
export function InvitePanel({ kind, open, name: given, button }: { kind: 'member' | 'household'; open: OpenInvite[]; name?: string; button?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'form' | 'made'>('idle');
  const [name, setName] = useState('');
  const [household, setHousehold] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const [made, setMade] = useState<OpenInvite[]>([]);
  const waiting = [...made, ...open.filter((i) => !made.some((m) => m.id === i.id))].filter((i) => !gone.includes(i.id));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await http<{ link: string; invite: OpenInvite }>('/api/invites', { body: { kind, name, household } });
      setLink(r.link);
      setMade((m) => [r.invite, ...m]);
      setStep('made');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied');
    } catch {
      window.prompt('Copy this link:', link);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Our Studio', text: kind === 'household' ? 'Start your household on Our Studio:' : 'Join us on Our Studio:', url: link });
    } catch {
      // They closed the share sheet; nothing to do.
    }
  };
  const cancel = async (i: OpenInvite) => {
    try {
      await http('/api/invites/cancel', { body: { id: i.id } });
      setGone((g) => [...g, i.id]);
      toast(`Invite for ${i.name} cancelled`);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-3">
      {step === 'idle' ? (
        <Button
          variant="secondary"
          size={given ? 'sm' : 'md'}
          icon={given ? 'send' : 'plus'}
          onClick={() => {
            setName(given ?? '');
            setHousehold('');
            setError('');
            setStep('form');
          }}
        >
          {button ?? (kind === 'household' ? 'Invite a new household' : 'Invite someone')}
        </Button>
      ) : step === 'form' ? (
        <form onSubmit={create} className="space-y-3 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
          <div>
            <label htmlFor={`invite-name-${kind}`} className="mb-1.5 block text-sm font-medium">
              Their name
            </label>
            <input id={`invite-name-${kind}`} value={name} maxLength={40} required autoFocus onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          {kind === 'household' ? (
            <div>
              <label htmlFor="invite-household" className="mb-1.5 block text-sm font-medium">
                Their household’s name <span className="font-normal text-muted">(they can change it)</span>
              </label>
              <input id="invite-household" value={household} maxLength={60} placeholder={name ? `${name}’s household` : 'The Riveras'} onChange={(e) => setHousehold(e.target.value)} className={field} />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" busy={busy}>
              Make the link
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('idle')}>
              Cancel
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="space-y-3 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-[15px]">
            Send this to <span className="font-medium">{made[0]?.name}</span> however you like (a text is easiest). It works once, for 7 days. Copy it now: it can’t be shown again.
          </p>
          <label htmlFor={`invite-link-${kind}`} className="sr-only">
            Invite link
          </label>
          <input id={`invite-link-${kind}`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${field} text-sm text-muted`} />
          <div className="flex flex-wrap gap-2">
            <Button icon="copy" onClick={copy}>
              Copy link
            </Button>
            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <Button variant="secondary" icon="send" onClick={share}>
                Share
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setStep('idle')}>
              Done
            </Button>
          </div>
        </div>
      )}

      {waiting.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Waiting to be used</p>
          <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl bg-sand-2/60 text-sm">
            {waiting.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{i.name}</span>
                  {i.householdName ? <span className="text-muted"> · {i.householdName}</span> : null}
                  <span className="text-muted"> · until {day(i.expiresAt)}</span>
                </span>
                <button type="button" onClick={() => cancel(i)} className="shrink-0 text-muted underline underline-offset-4" aria-label={`Cancel the invite for ${i.name}`}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
