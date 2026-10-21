'use client';
import { useEffect, useRef, useState } from 'react';
import { http } from '@/lib/client/http';
import { EmailCode } from './EmailCode';
import { GoogleMark } from './GoogleMark';
import { Button } from './ui';

interface InviteView {
  kind: 'member' | 'household';
  from: string;
  household: string;
  name: string;
  expiresAt: string;
}

/**
 * An invite, opened: who it's from and what for, then a way in. Signed in
 * already, it's one tap; otherwise your name, then Google or an emailed code.
 */
export function JoinInvite({ me, google, codes }: { me: { name: string } | null; google: boolean; codes: boolean }) {
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const opened = useRef(false);
  useEffect(() => {
    // Once only: the second run of a double-run effect would find the address bar already cleared.
    if (opened.current) return;
    opened.current = true;
    // Take the secret out of the address bar straight away, so it isn't left in history or shared by accident.
    const secret = window.location.hash.slice(1);
    if (secret) window.history.replaceState(null, '', '/join');
    setToken(secret);
    http<{ invite: InviteView }>('/api/auth/invite', { body: secret ? { token: secret } : {} })
      .then(({ invite }) => {
        setInvite(invite);
        setName(invite.name);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Keeps the name they gave with the invite, for when they come back from signing in.
  const hold = async () => {
    await http('/api/auth/invite', { body: { ...(token ? { token } : {}), name } });
  };

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await http('/api/auth/invite/accept', { body: token ? { token } : {} });
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const google_ = async () => {
    setBusy(true);
    setError('');
    try {
      await hold();
      window.location.assign('/api/auth/google');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (error && !invite) {
    return (
      <>
        <h1 className="font-display text-[30px] leading-tight font-semibold">That invite didn’t work</h1>
        <p role="alert" className="mt-4 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
        <a href="/" className="mt-6 text-sm text-muted underline underline-offset-4">
          Go to Our Studio
        </a>
      </>
    );
  }
  if (!invite) return <p className="text-muted">Opening your invite…</p>;

  const what =
    invite.kind === 'household' ? (
      <>
        to start a household of your own on Our Studio. It’ll be called <span className="font-medium text-ink">{invite.household}</span> until you rename it.
      </>
    ) : (
      <>
        to join <span className="font-medium text-ink">{invite.household}</span> on Our Studio, where you design things together.
      </>
    );
  const days = Math.max(1, Math.ceil((Date.parse(invite.expiresAt) - Date.now()) / 86_400_000));
  const field =
    'mt-1.5 h-12 w-full rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon';

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">You’re invited</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight font-semibold">{invite.from} invited you</h1>
      <p className="mt-3 text-[17px] text-muted">{what}</p>
      <p className="mt-2 text-sm text-muted">
        The link works once, for {days === 1 ? 'one more day' : `${days} more days`}.
      </p>

      {me ? (
        <div className="mt-8">
          <Button size="lg" className="w-full" onClick={join} busy={busy}>
            {invite.kind === 'household' ? `Start it as ${me.name}` : `Join as ${me.name}`}
          </Button>
          <form action="/api/logout" method="post" className="mt-3 text-center">
            <button className="text-sm text-muted underline underline-offset-4">Not {me.name}? Sign out first</button>
          </form>
        </div>
      ) : (
        <>
          <label htmlFor="join-name" className="mt-8 block text-sm font-medium">
            What should everyone call you?
          </label>
          <input id="join-name" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)} className={field} />
          {google ? (
            <button
              type="button"
              onClick={google_}
              disabled={busy || !name.trim()}
              className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-[16px] font-medium shadow-[var(--shadow-card)] ring-1 ring-line transition hover:ring-ink/20 active:scale-[0.98] disabled:opacity-60"
            >
              <GoogleMark />
              Continue with Google
            </button>
          ) : null}
          {codes ? <EmailCode folded={google} beforeSend={hold} invited /> : null}
          {!google && !codes ? <p className="mt-6 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#8a6410]">Signing in isn’t set up on this site yet.</p> : null}
          <p className="mt-6 text-sm text-muted">
            We only ask Google (or your email) to confirm your address. Nothing is shared with the AI services until you say OK on the next screen.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </>
  );
}
