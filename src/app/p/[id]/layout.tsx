import { redirect } from 'next/navigation';
import { getUser, HttpError } from '@/lib/server/auth';
import { DatabaseUnreachable, SetupNeeded } from '@/lib/server/repo';
import { ensureSeed, projectState } from '@/lib/server/studio';
import { ProjectProvider } from '@/components/ProjectProvider';
import { ProjectHeader } from '@/components/ProjectHeader';
import { Toaster } from '@/components/Toast';
import { ArchivedProjectBanner } from '@/components/ArchiveBits';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/');
  const { id } = await params;
  let state;
  try {
    await ensureSeed();
    state = await projectState(id, user);
  } catch (e) {
    // Not there (or not theirs), or the database is down or not set up: home says which. Anything else is a real
    // problem, for the error screen and an alert, not a quiet trip home.
    if (e instanceof HttpError || e instanceof SetupNeeded || e instanceof DatabaseUnreachable) redirect('/');
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
