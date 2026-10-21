'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui';

/** If one screen of a project breaks, the rest of the app keeps working. */
export default function ProjectError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">That didn&apos;t load</h1>
      <p className="mt-3 text-muted">Something on this screen tripped up. Your designs and hearts are safe.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => retry()} icon="send">
          Try again
        </Button>
        <Link href="/" className="inline-flex h-11 items-center rounded-full px-5 font-medium ring-1 ring-line">
          Home
        </Link>
      </div>
    </main>
  );
}
