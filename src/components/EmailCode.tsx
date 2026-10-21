'use client';
import { useState, type FormEvent } from 'react';
import { http } from '@/lib/client/http';
import { Button } from './ui';

/**
 * "Email me a code" on the sign-in screen: an address, then the six digits
 * from the email. Folded away under Google's button when that's on too. On an
 * invite, `beforeSend` saves the name they gave first, and any address gets a code.
 */
export function EmailCode({ folded, beforeSend, invited = false }: { folded: boolean; beforeSend?: () => Promise<void>; invited?: boolean }) {
  const [step, setStep] = useState<'closed' | 'email' | 'code'>(folded ? 'closed' : 'email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await beforeSend?.();
      const { to } = await http<{ to: string }>('/api/auth/code', { body: { email } });
      setSentTo(to);
      setCode('');
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const check = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await http('/api/auth/code/check', { body: { code } });
      // A full load, so the server draws the signed-in home (or the AI welcome).
      window.location.assign('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (step === 'closed') {
    return (
      <button type="button" onClick={() => setStep('email')} className="mt-4 text-center text-sm text-muted underline underline-offset-4">
        No Google account? Get a code by email
      </button>
    );
  }

  const field =
    'mt-1.5 h-12 w-full rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon';
  return (
    <div className={folded ? 'mt-6' : 'mt-8'}>
      {step === 'email' ? (
        <form onSubmit={send}>
          <label htmlFor="code-email" className="text-sm font-medium">
            Your email address
          </label>
          <input
            id="code-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <Button type="submit" size="lg" variant={folded ? 'secondary' : 'primary'} className="mt-3 w-full" busy={busy}>
            Email me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={check}>
          <p className="text-[15px]">
            {invited ? (
              <>
                A six-digit code is on its way to <span className="font-medium">{sentTo}</span>.
              </>
            ) : (
              <>
                If <span className="font-medium">{sentTo}</span> is on the list, a six-digit code is on its way.
              </>
            )}{' '}
            It can take a minute; check spam the first time.
          </p>
          <label htmlFor="code-digits" className="mt-4 block text-sm font-medium">
            Code
          </label>
          <input
            id="code-digits"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${field} text-center font-medium tracking-[0.4em] tabular-nums`}
          />
          <Button type="submit" size="lg" className="mt-3 w-full" busy={busy}>
            Sign in
          </Button>
          <div className="mt-3 flex justify-between text-sm text-muted">
            <button type="button" className="underline underline-offset-4" onClick={() => send()} disabled={busy}>
              Send a new code
            </button>
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setStep('email');
                setError('');
              }}
            >
              Use a different address
            </button>
          </div>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
