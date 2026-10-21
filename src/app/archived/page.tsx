import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { archivedSummaries } from '@/lib/server/overview';
import { membersOf } from '@/lib/server/people';
import { preset } from '@/lib/design/occasions';
import { occasionsOf } from '@/lib/server/studio';
import { ArchivedList, type ArchivedRow } from '@/components/ArchivedList';
import { Icon } from '@/components/Icon';
import { Toaster } from '@/components/Toast';

export const dynamic = 'force-dynamic';

export default async function ArchivedPage() {
  const user = await getUser();
  if (!user) redirect('/');
  const rows: ArchivedRow[] = (await archivedSummaries(user)).map((s) => ({
    id: s.project.id,
    title: s.project.title,
    kind: preset(occasionsOf(s.project)[0] ?? 'everyday').short,
    approved: s.project.status === 'approved',
    copy: s.project.brief.copy,
    pick: s.pick ? { design: s.pick.payload } : null,
    shirt: s.shirt,
    total: s.total,
    matches: s.matches,
    startedAt: s.project.createdAt,
    startedBy: s.startedBy,
    archivedAt: s.archivedAt,
    archivedBy: s.archivedBy,
    canRestore: s.canRestore,
    keep: s.keep,
  }));
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-4xl lg:px-10 lg:pt-12">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted lg:hidden">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <h1 className="font-display text-[30px] leading-tight font-semibold">Archived</h1>
      <p className="mb-6 mt-1 text-muted">Projects put away, newest first. Restoring one puts it back on the home screen exactly as it was.</p>
      <ArchivedList rows={rows} members={(await membersOf(user.household)).length} />
      <Toaster />
    </main>
  );
}
