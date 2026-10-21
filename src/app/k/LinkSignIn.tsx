'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

type State = 'working' | 'bad' | 'off' | 'offline';

export function LinkSignIn() {
  const [state, setState] = useState<State>('working');
  const token = useRef('');
  const started = useRef(false);

  const send = useCallback(async () => {
    setState('working');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.current }),
        cache: 'no-store',
      });
      if (res.ok) {
        token.current = '';
        window.location.replace('/');
      } else setState(res.status === 410 ? 'off' : 'bad');
    } catch {
      setState('offline');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const raw = window.location.hash.slice(1);
    // Wipe the token from the address bar and history straight away.
    window.history.replaceState(null, '', '/k');
    try {
      token.current = decodeURIComponent(raw).trim();
    } catch {
      token.current = '';
    }
    if (token.current) void send();
    else setState('bad');
  }, [send]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
      <h1 className="font-display text-[34px] leading-tight font-semibold">{state === 'working' ? 'Signing you in…' : 'Our Studio'}</h1>
      {state === 'bad' ? (
        <p className="mt-6 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          That link didn&apos;t work. Ask whoever sent it for a fresh one, and open it exactly as it came.
        </p>
      ) : null}
      {state === 'off' ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-2xl bg-white px-4 py-3 text-[15px] shadow-[var(--shadow-card)]">Personal links are switched off now. Sign in with Google instead.</p>
          <a href="/" className="inline-flex h-11 items-center rounded-full bg-lagoon px-5 font-medium text-white">
            Go to sign-in
          </a>
        </div>
      ) : null}
      {state === 'offline' ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#8a6410]">Couldn&apos;t reach the studio. Check the connection and try again.</p>
          <Button onClick={send} icon="send">
            Try again
          </Button>
        </div>
      ) : null}
    </main>
  );
}
