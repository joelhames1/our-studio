import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser, HttpError } from '@/lib/server/auth';
import { DatabaseUnreachable, SetupNeeded } from '@/lib/server/repo';
import { ensureSeed, projectState } from '@/lib/server/studio';
import { safeNext } from '@/lib/engine/paths';
import { ProjectProvider } from '@/components/ProjectProvider';
import { ProjectHeader } from '@/components/ProjectHeader';
import { Toaster } from '@/components/Toast';
import { ArchivedProjectBanner } from '@/components/ArchiveBits';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await getUser();
  const { id } = await params;
  if (!user) {
    // Signed out: sign in, then straight back here.
    const next = safeNext((await headers()).get('x-pathname')) ?? safeNext(`/p/${id}`);
    redirect(next ? `/?next=${encodeURIComponent(next)}` : '/');
  }
  let state;
  try {
    await ensureSeed();
    state = await projectState(id, user);
  } catch (e) {
    // Not there, or not theirs: say so, rather than a quiet trip home.
    if (e instanceof HttpError) return <ProjectMissing />;
    // The database is down or not set up: home says which. Anything else is a real
    // problem, for the error screen and an alert.
    if (e instanceof SetupNeeded || e instanceof DatabaseUnreachable) redirect('/');
    throw e;
  }
  return (
    <ProjectProvider initial={state}>
      <ProjectHeader />
      <main className="mx-auto max-w-xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:max-w-6xl lg:px-8 lg:pb-12 lg:pt-8">
        <ArchivedProjectBanner />
        {children}
      </main>
      <Toaster />
    </ProjectProvider>
  );
}

/** A project link that leads nowhere for you: deleted, mistyped, or another household's. */
function ProjectMissing() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-6 py-16">
      <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
      <h1 className="font-display text-3xl font-semibold">We can&apos;t find that project</h1>
      <p className="mt-3 text-muted">
        It may have been deleted, or it belongs to a household you&apos;re not in. If someone sent you the link, ask them to invite you to their household.
      </p>
      <div className="mt-6">
        <Link prefetch={false} href="/" className="inline-flex h-11 items-center rounded-full bg-lagoon px-5 font-medium text-white">
          Go home
        </Link>
      </div>
    </main>
  );
}
