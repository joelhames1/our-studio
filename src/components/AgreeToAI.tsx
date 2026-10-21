'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { User } from '@/lib/engine/types';
import { http } from '@/lib/client/http';
import { Icon } from './Icon';
import { Button } from './ui';

const POINTS = [
  {
    icon: 'wand',
    head: 'AI does some of the work.',
    text: 'Claude, from Anthropic, suggests words, makes the changes you ask for and finds printers near you. An artwork service paints the pictures.',
  },
  {
    icon: 'send',
    head: 'So what you type is sent to them.',
    text: 'Project names, the people, dates and places you add, and the changes you ask for go to those services to get an answer. By default they don’t use it to train their models.',
  },
  {
    icon: 'key',
    head: 'Nothing goes until you say OK.',
    text: 'You’re only asked once. Everything else stays in Our Studio, where only the people you make things with can see it.',
  },
];

/** The first thing you see after signing in for the first time: how AI is used, and an OK before any of it happens. */
export function AgreeToAI({ me }: { me: User }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await http('/api/consent', { body: {} });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-16">
      <div className="flex flex-1 flex-col justify-center">
        <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
        <h1 className="font-display text-[30px] leading-tight font-semibold">Welcome, {me.name}</h1>
        <p className="mt-2 text-[17px] text-muted">One thing before you start.</p>
        <ul className="mt-7 space-y-5">
          {POINTS.map((p) => (
            <li key={p.icon} className="flex gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lagoon-soft text-lagoon-deep">
                <Icon name={p.icon} size={18} />
              </span>
              <p className="text-[15px] leading-relaxed">
                <span className="font-medium">{p.head}</span> <span className="text-ink/80">{p.text}</span>
              </p>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-6 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
            {error}
          </p>
        ) : null}
        <Button size="lg" className="mt-8 w-full" busy={busy} onClick={go}>
          OK, let’s start
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          The details are in the{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </div>
      <form action="/api/logout" method="post" className="mt-8 text-center">
        <button className="text-sm text-muted underline underline-offset-4">Not now: sign out</button>
      </form>
    </main>
  );
}
