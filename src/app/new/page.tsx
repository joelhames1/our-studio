import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { OCCASIONS } from '@/lib/design/back/facts';
import type { Occasion } from '@/lib/design/back/types';
import { Toaster } from '@/components/Toast';
import { NewProject } from './NewProject';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ occasion?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect('/');
  // ?occasion=birthday (from the first-visit shortcuts) skips straight to the details.
  const { occasion } = await searchParams;
  const start = OCCASIONS.find((o) => o.id === occasion)?.id as Occasion | undefined;
  return (
    <>
      <NewProject ai={!!config.anthropicKey} start={start} />
      <Toaster />
    </>
  );
}
