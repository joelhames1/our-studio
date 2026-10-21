'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui';

/**
 * Anything that breaks outside a project screen lands here. In production the
 * real message stays on the server; the code below finds it in Vercel → Logs.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = (error as { digest?: string } | null)?.digest;
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
      <h1 className="font-display text-3xl font-semibold">Something went sideways</h1>
      <p className="mt-3 text-muted">That screen didn&apos;t load. Try again in a moment; if it keeps happening, the code below helps track it down.</p>
      {digest ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 font-mono text-sm shadow-[var(--shadow-card)]">
          Error code {digest}
          <span className="mt-1 block font-sans text-xs text-muted">Search for it in Vercel → the project → Logs.</span>
        </p>
      ) : null}
      <div className="mt-6">
        <Button onClick={() => retry()} icon="send">
          Try again
        </Button>
      </div>
    </main>
  );
}
