import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ERASE_DAYS, peopleOverview } from '@/lib/server/account';
import { getUser } from '@/lib/server/auth';
import { directoryStored } from '@/lib/server/people';
import { EmptyHousehold, OwnerlessHousehold, PersonCard } from '@/components/PeopleTools';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

/** Setup → People: everyone on the site, closed accounts, and households nobody's in. Only for whoever runs the site. */
export default async function PeoplePage() {
  const user = await getUser();
  if (!user) redirect('/');
  if (!user.admin) redirect('/');
  const stored = await directoryStored();
  const { people, empty, ownerless } = stored ? await peopleOverview(user) : { people: [], empty: [], ownerless: [] };
  const open = people.filter((p) => p.status === 'open');
  const archived = people.filter((p) => p.status !== 'open');
  const list = 'divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]';
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-3xl lg:px-10 lg:pt-12">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted">
        <Icon name="chevronLeft" size={16} /> Setup
      </Link>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">Setup</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight font-semibold">People</h1>
      <p className="mt-1 text-muted">
        Everyone on the site, and what you can do about an account. Their projects stay private to their households: this page never shows them.
      </p>

      {!stored ? (
        <p className="mt-6 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
          This needs households set up first: run <code className="text-sm">supabase/migrations/0006_households.sql</code> (it&apos;s on the Setup page).
        </p>
      ) : (
        <>
          <section aria-labelledby="open-heading" className="mt-6">
            <h2 id="open-heading" className="mb-2 font-display text-xl font-semibold">
              Signed up ({open.length})
            </h2>
            <ul className={list}>
              {open.map((p) => (
                <PersonCard key={p.id} p={p} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="closed-heading" className="mt-8">
            <h2 id="closed-heading" className="mb-1 font-display text-xl font-semibold">
              Closed and switched off ({archived.length})
            </h2>
            <p className="mb-3 text-[15px] text-muted">
              Nothing in these accounts is deleted unless it says so. Someone who closed their own account comes back with an invite; one you switched off only
              comes back if you restore it. Erasing is for good (last night&apos;s backup keeps a copy for {ERASE_DAYS} days). Accounts whose owners asked to be
              erased go in the nightly job once their date comes.
            </p>
            {archived.length ? (
              <ul className={list}>
                {archived.map((p) => (
                  <PersonCard key={p.id} p={p} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-white px-4 py-3 text-[15px] text-muted shadow-[var(--shadow-card)]">None.</p>
            )}
          </section>

          {ownerless.length ? (
            <section aria-labelledby="ownerless-heading" className="mt-8">
              <h2 id="ownerless-heading" className="mb-1 font-display text-xl font-semibold">
                Households without an owner ({ownerless.length})
              </h2>
              <p className="mb-3 text-[15px] text-muted">Nobody there can invite people or look after other people&apos;s projects until someone owns it.</p>
              <ul className={list}>
                {ownerless.map((h) => (
                  <OwnerlessHousehold key={h.id} h={h} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="empty-heading" className="mt-8">
            <h2 id="empty-heading" className="mb-1 font-display text-xl font-semibold">
              Households nobody&apos;s in ({empty.length})
            </h2>
            <p className="mb-3 text-[15px] text-muted">Left when everyone in one closed their account. Kept until you erase them, so a restore brings them back.</p>
            {empty.length ? (
              <ul className={list}>
                {empty.map((h) => (
                  <EmptyHousehold key={h.id} h={h} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-white px-4 py-3 text-[15px] text-muted shadow-[var(--shadow-card)]">None.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
