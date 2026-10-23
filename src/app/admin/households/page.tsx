import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { setupStatus } from '@/lib/server/setup';
import { Icon } from '@/components/Icon';
import { HouseholdBudgets } from '@/components/AdminBits';
import { InvitePanel } from '@/components/InvitePanel';
import { AdminOnly, Code, Row } from '../rows';

export const dynamic = 'force-dynamic';

/** Running the site day to day: inviting new households, their AI budgets, and everyone on it. Only for whoever runs it. */
export default async function AllHouseholdsPage() {
  const user = await getUser();
  if (!user) redirect(`/?next=${encodeURIComponent('/admin/households')}`);
  if (!user.admin) return <AdminOnly />;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const s = await setupStatus(`${proto}://${h.get('host')}`);
  /** What the households with limits of their own could spend between them. */
  const limitsTotal = s.budget.households.reduce((a, h) => a + (h.limit ?? 0), 0);

  return (
    <main className="mx-auto max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-5xl lg:px-8 lg:pt-10">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-muted">
        <Icon name="chevronLeft" size={16} /> Setup
      </Link>
      <h1 className="font-display text-[30px] font-semibold">All households</h1>
      <p className="mb-6 mt-1 text-muted">
        Everyone on Our Studio, new households by invite, and what each spends on AI. Only you see this page.{' '}
        <Link href="/admin/people" className="underline underline-offset-2">
          People
        </Link>{' '}
        has everyone one by one.
      </p>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <Row ok={s.households.stored && s.invites.ready ? true : 'warn'} title="Households and invites">
          {s.households.stored ? (
            <p>
              {s.households.count} household{s.households.count === 1 ? '' : 's'}, {s.households.people} {s.households.people === 1 ? 'person' : 'people'}.{' '}
              <Link href="/household" className="underline underline-offset-2">
                Yours
              </Link>{' '}
              shows who&apos;s in it;{' '}
              <Link href="/admin/people" className="underline underline-offset-2">
                People
              </Link>{' '}
              shows everyone, with closed accounts and erasing.
            </p>
          ) : (
            <p>
              Run <Code>supabase/migrations/0006_households.sql</Code> (it&apos;s in the setup SQL on Setup). The two of you move into the database as the first
              household, you as its owner. Until then you&apos;re both worked out from <Code>ERIN_GOOGLE_EMAIL</Code> and <Code>JOEL_GOOGLE_EMAIL</Code>, as before.
            </p>
          )}
          <ul className="space-y-1">
            {s.households.first.map((p) => (
              <li key={p.name}>
                <span className="inline-block w-12 font-medium">{p.you ? 'You' : p.name}</span>{' '}
                {p.email ?? <span className="text-muted">no address yet ({p.you ? 'JOEL_GOOGLE_EMAIL' : 'ERIN_GOOGLE_EMAIL'})</span>}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            While <Code>ERIN_GOOGLE_EMAIL</Code> and <Code>JOEL_GOOGLE_EMAIL</Code> are in Vercel, they stay Erin&apos;s and your sign-in addresses; change one and
            redeploy to change who that is.
          </p>
          {s.households.stored && s.invites.ready ? (
            <>
              <p>
                New households only arrive by invite from you. Whoever opens the link signs in with Google or an emailed code and becomes their household&apos;s owner,
                with ${s.budget.newHouseholds} a month of AI to start. To add someone to your own household, use{' '}
                <Link href="/household" className="underline underline-offset-2">
                  Household
                </Link>
                .
              </p>
              <InvitePanel kind="household" open={s.invites.open} />
            </>
          ) : s.households.stored ? (
            <p>
              To invite people, run <Code>supabase/migrations/0007_invites_and_sessions.sql</Code> (it&apos;s in the setup SQL on Setup). It adds invites and the list of
              signed-in devices.
            </p>
          ) : null}
        </Row>

        <Row
          ok={s.budget.spent < s.budget.limit * 0.8 && s.budget.households.every((h) => h.limit === null || h.spent < h.limit * 0.8) && limitsTotal <= s.budget.limit ? true : 'warn'}
          title="AI spending this month"
        >
          <div className="h-2.5 overflow-hidden rounded-full bg-sand-2">
            <div className="h-full rounded-full bg-lagoon" style={{ width: `${Math.min(100, (s.budget.spent / Math.max(s.budget.limit, 0.01)) * 100)}%` }} />
          </div>
          <p>
            ${s.budget.spent.toFixed(2)} of ${s.budget.limit} across the whole site (change with <Code>MONTHLY_BUDGET_USD</Code>). Fresh ideas and remixes are free; only new artwork and Claude calls cost anything.
          </p>
          {s.budget.households.length ? (
            <>
              <p>
                Each household also has its own limit, so nobody can use up everyone else&apos;s month. New households start at ${s.budget.newHouseholds}; yours has none of its own
                unless you give it one. Whatever the limits, everything stops once the site&apos;s budget is used up.
              </p>
              <HouseholdBudgets households={s.budget.households} editable={s.budget.editable} />
              {limitsTotal > s.budget.limit ? (
                <p className="text-sm text-coral">
                  The households&apos; own limits add up to ${limitsTotal}, more than the site&apos;s ${s.budget.limit}. If they all used theirs, the site&apos;s budget would run out
                  for everyone, yours included. Raise <Code>MONTHLY_BUDGET_USD</Code> as households join, or lower a household&apos;s limit.
                </p>
              ) : null}
              {!s.budget.editable ? <p className="text-sm text-muted">Changing them needs the households setup file run (see Households and invites).</p> : null}
            </>
          ) : null}
          {s.budget.recent.length ? (
            <ul className="divide-y divide-line/70 text-sm">
              {s.budget.households.length > 1 ? <li className="py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Recent, your household</li> : null}
              {s.budget.recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate text-muted">{r.note}</span>
                  <span className="tabular-nums">${r.usd.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Row>
      </div>
    </main>
  );
}
