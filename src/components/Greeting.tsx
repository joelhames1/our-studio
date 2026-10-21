'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { helloFor, TZ_COOKIE } from '@/lib/engine/greeting';

const never = () => () => {};

/**
 * "Good morning, Joel." by the reader's own clock. The server guesses from the
 * time zone this browser told it last visit (plain "Hello" the first time), and
 * the browser corrects it if the guess was off.
 */
export function Greeting({ name, guess }: { name: string; guess: string }) {
  const hello = useSyncExternalStore(never, () => helloFor(new Date().getHours()), () => guess);
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return (
    <>
      {hello}, {name}.
    </>
  );
}
