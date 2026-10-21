import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ADMIN, getUser } from '@/lib/server/auth';
import { config } from '@/lib/server/config';
import { directoryCounts, getHousehold, membersOf, pastMembersOf, personById } from '@/lib/server/people';
import { householdBudget, spentThisMonth } from '@/lib/server/spend';
import { openInvites } from '@/lib/server/invites';
import { InvitePanel } from '@/components/InvitePanel';
import { HouseholdMembers, LeaveHousehold, SwitchHousehold } from '@/components/HouseholdMembers';
import { HouseholdName } from '@/components/HouseholdName';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

const PAST = { removed: 'taken out', left: 'left', closed: 'closed their account', 'switched-off': 'account switched off' } as const;

/** Who's in the household, and for its owners, renaming it, inviting people and changing who's in it. Anyone can leave, or switch to another of theirs. */
export default async function HouseholdPage() {
  const user = await getUser();
  if (!user) redirect('/');
  const [household, members, stored] = await Promise.all([getHousehold(user.household), membersOf(user.household), directoryCounts()]);
  const owner = user.role === 'owner';
  const limit = householdBudget(user.household, household);
  const spent = await spentThisMonth(user.household).catch(() => null);
  const invites = owner && stored ? await openInvites(user).catch(() => null) : null;
  const past = owner && stored ? await pastMembersOf(user.household) : [];
  const admins = new Set((await Promise.all(members.map((m) => personById(m.id)))).filter((p) => p?.siteAdmin).map((p) => p!.id));
  const mine = user.households.length > 1 ? await Promise.all(user.households.map(async (id) => ({ id, name: (await getHousehold(id))?.name ?? 'A household', role: user.roles[id] }))) : [];
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-3xl lg:px-10 lg:pt-12">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted lg:hidden">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">Your household</p>
      <HouseholdName name={household?.name ?? 'Your household'} canRename={owner && !!stored} />
      <p className="mb-6 mt-1 text-muted">Everyone here sees the same projects, hearts and approvals. Nobody outside it sees any of them.</p>

      <HouseholdMembers
        me={user.id}
        owner={owner && !!stored}
        // Only owners see everyone's address; everyone sees their own.
        members={members.map((m) => ({ id: m.id, name: m.name, role: m.role, admin: admins.has(m.id), ...(owner || m.id === user.id ? { email: m.email ?? null } : {}) }))}
      />

      {owner && stored ? (
        <section aria-labelledby="invite-heading" className="mt-6">
          <h2 id="invite-heading" className="mb-2 font-display text-xl font-semibold">
            Invite people
          </h2>
          {invites ? (
            <>
              <p className="mb-3 text-[15px] text-muted">Anyone you invite sees this household’s projects, hearts and approvals, and can vote and approve.</p>
              <InvitePanel kind="member" open={invites.map((i) => ({ id: i.id, name: i.name, expiresAt: i.expiresAt }))} />
            </>
          ) : (
            <p className="rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
              Inviting people needs one setup step: run <code className="text-sm">supabase/migrations/0007_invites_and_sessions.sql</code> in Supabase&apos;s SQL Editor
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
      ) : null}

      {past.length ? (
        <section aria-labelledby="past-heading" className="mt-6">
          <h2 id="past-heading" className="mb-2 font-display text-xl font-semibold">
            Past members
          </h2>
          <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
            {past.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-[15px]">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-muted">
                    {' '}
                    · {PAST[m.ended]} {new Date(m.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                {m.invitable && invites ? (
                  <InvitePanel kind="member" open={[]} name={m.name} button="Invite back" />
                ) : !m.invitable ? (
                  <span className="text-sm text-muted">Only {ADMIN.name} can bring them back</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">Their hearts come back with them. Nothing of theirs was deleted.</p>
        </section>
      ) : null}

      {spent !== null ? (
        <div className="mt-5 rounded-3xl bg-white px-4 py-3.5 shadow-[var(--shadow-card)]">
          <p className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="font-medium">AI this month</span>
            <span className="tabular-nums">
              ${spent.toFixed(2)}
              {limit !== null ? <span className="text-muted"> of ${limit}</span> : null}
            </span>
          </p>
          {limit !== null ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-2">
              <div className="h-full rounded-full bg-lagoon" style={{ width: `${Math.min(100, (spent / Math.max(limit, 0.01)) * 100)}%` }} />
            </div>
          ) : null}
          <p className="mt-2 text-sm text-muted">
            {limit === null ? `No limit of its own; the site’s $${config.monthlyBudgetUsd} a month covers it. ` : null}
            New artwork and Claude calls come out of it; fresh ideas, remixes and hand edits are free.{' '}
            {user.admin ? 'Change it on the Setup page.' : `${ADMIN.name}, who runs Our Studio, sets ${limit === null ? 'that' : 'it'}.`}
          </p>
        </div>
      ) : null}

      <p className="mt-5 text-sm text-muted">
        {owner
          ? 'As an owner you can rename the household, invite people, change who owns it, and archive or delete any of its projects.'
          : `${members.find((m) => m.role === 'owner')?.name ?? 'The owner'} looks after the household: inviting people, renaming it, and archiving or deleting any of its projects.`}
      </p>

      {mine.length ? (
        <section aria-labelledby="yours-heading" className="mt-8">
          <h2 id="yours-heading" className="mb-2 font-display text-xl font-semibold">
            Your households
          </h2>
          <SwitchHousehold households={mine} current={user.household} />
        </section>
      ) : null}

      {/* Whoever runs the site has to keep a household, so they only see Leave once they're in two. */}
      {stored && !(user.admin && user.households.length === 1) ? (
        <div className="mt-8">
          <LeaveHousehold name={household?.name ?? 'the household'} only={user.households.length === 1} />
        </div>
      ) : null}
      {owner && !stored ? (
        <p className="mt-4 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
          Renaming needs one setup step: run <code className="text-sm">supabase/migrations/0006_households.sql</code> in Supabase&apos;s SQL Editor (it&apos;s also on the{' '}
          {user.admin ? (
            <Link href="/admin" className="underline underline-offset-2">
              Setup page
            </Link>
          ) : (
            'Setup page'
          )}
          ).
        </p>
      ) : null}
    </main>
  );
}
