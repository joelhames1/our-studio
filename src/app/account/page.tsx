import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CLOSE_WORD, ERASE_DAYS } from '@/lib/server/account';
import { currentSessionId, getUser } from '@/lib/server/auth';
import { directoryStored, getHousehold, membersOf, personById } from '@/lib/server/people';
import { devicesOf } from '@/lib/server/sessions';
import { AccountName, CloseAccount, Devices } from '@/components/AccountBits';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

/** You: your name, where you're signed in, and closing your account. */
export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect('/');
  const [person, stored, here] = await Promise.all([personById(user.id), directoryStored(), currentSessionId()]);
  const devices = stored ? await devicesOf(user, here).catch(() => null) : null;
  // Households that would go if the account were erased, since nobody else is in them.
  const alone = (
    await Promise.all(user.households.map(async (h) => ((await membersOf(h)).length === 1 ? ((await getHousehold(h))?.name ?? 'your household') : null)))
  ).filter((n): n is string => !!n);

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-3xl lg:px-10 lg:pt-12">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted lg:hidden">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">You</p>
      <AccountName name={user.name} canRename={stored} />
      <p className="mt-1 text-muted">{person?.email ? `You sign in as ${person.email}.` : 'No sign-in address on file yet.'}</p>

      <section aria-labelledby="devices-heading" className="mt-8">
        <h2 id="devices-heading" className="mb-2 font-display text-xl font-semibold">
          Where you’re signed in
        </h2>
        {devices ? (
          <Devices devices={devices} />
        ) : (
          <p className="rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
            The list of your devices needs one setup step: {user.admin ? 'run' : 'whoever runs the site runs'} <code className="text-sm">supabase/migrations/0007_invites_and_sessions.sql</code>
            {user.admin ? (
              <>
                {' '}
                (it&apos;s on the{' '}
                <Link href="/admin" className="underline underline-offset-2">
                  Setup page
                </Link>
                )
              </>
            ) : null}
            .
          </p>
        )}
      </section>

      <section aria-labelledby="close-heading" className="mt-10">
        <h2 id="close-heading" className="mb-2 font-display text-xl font-semibold">
          Close your account
        </h2>
        {user.admin ? (
          <p className="text-[15px] text-muted">You run the site, so your account stays open. Everyone else can close theirs here.</p>
        ) : stored ? (
          <CloseAccount word={CLOSE_WORD} days={ERASE_DAYS} alone={alone} />
        ) : (
          <p className="text-[15px] text-muted">This comes once households are set up.</p>
        )}
      </section>
    </main>
  );
}
