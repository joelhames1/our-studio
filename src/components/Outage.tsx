'use client';
import { Button } from '@/components/ui';

/**
 * When the database can't be reached (an outage, a paused project): nothing
 * is lost, it's just out of reach for now. `problem` is what went wrong, for
 * whoever runs the site; everyone else just gets the gist.
 */
export function OutageNotice({ admin, problem }: { admin: string; problem?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
      <h1 className="font-display text-3xl font-semibold">Can&apos;t reach the database</h1>
      <p className="mt-3 text-muted">
        Nothing&apos;s lost: everything is saved, the studio just can&apos;t get to it right now. Try again in a minute; if it lasts, {admin} has been sent the
        details.
      </p>
      {problem ? <p className="mt-4 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">{problem}</p> : null}
      <div className="mt-6">
        <Button onClick={() => location.reload()} icon="send">
          Try again
        </Button>
      </div>
    </main>
  );
}
