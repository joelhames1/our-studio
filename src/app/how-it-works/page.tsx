import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { HOW_MONEY, HowItWorks } from '@/components/HowItWorks';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

/** The four steps again, for anyone who wants a reminder. */
export default async function HowItWorksPage() {
  const user = await getUser();
  if (!user) redirect('/');
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-3xl lg:px-10 lg:pt-12">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted lg:hidden">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">Our Studio</p>
      <h1 className="mb-5 mt-1 font-display text-[30px] leading-tight font-semibold">How it works</h1>
      <HowItWorks />
      <p className="mt-4 text-sm text-muted">{HOW_MONEY}</p>
      <ul className="mt-6 space-y-2 text-[15px] text-muted">
        <li>
          <span className="font-medium text-ink">Keyboard:</span> on a laptop, press <kbd className="rounded-md bg-white px-1.5 text-xs ring-1 ring-line">?</kbd> for the
          shortcuts (L to love, M for maybe, P to pass).
        </li>
        <li>
          <span className="font-medium text-ink">Who decides:</span> whoever started a project has the final say until they hand it on (Final say · Change on the
          project page).
        </li>
        <li>
          <span className="font-medium text-ink">Your household:</span> who&apos;s in it, inviting people and leaving are on{' '}
          <Link href="/household" className="underline underline-offset-4">
            Household
          </Link>
          .
        </li>
      </ul>
      <Link href="/new" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-lagoon px-5 font-medium text-white hover:bg-lagoon-deep">
        <Icon name="plus" size={18} /> Start something new
      </Link>
    </main>
  );
}
