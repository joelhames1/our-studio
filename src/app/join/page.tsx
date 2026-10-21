import type { Metadata } from 'next';
import { getUser } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { JoinInvite } from '@/components/JoinInvite';
import { LegalLinks } from '@/components/Legal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'You’re invited · Our Studio', referrer: 'no-referrer' };

/** Where an invite link lands. The secret is after the #, so only the browser ever sees it. */
export default async function JoinPage() {
  const user = await getUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-16">
      <div className="flex flex-1 flex-col justify-center">
        <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
        <JoinInvite me={user ? { name: user.name } : null} google={config.googleSignIn} codes={config.emailCodes} />
      </div>
      <LegalLinks home={false} className="mt-10 justify-center" />
    </main>
  );
}
