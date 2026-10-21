import Link from 'next/link';
import { cookies } from 'next/headers';
import { ADMIN, getUser } from '@/lib/server/auth';
import { getHousehold, membersOf, nameOf, needsWelcome } from '@/lib/server/people';
import { config } from '@/lib/server/config';
import { REFUSALS, type Refusal } from '@/lib/server/google';
import { aiTrouble, backupTrouble, type ServiceTrouble } from '@/lib/server/health';
import { archivedCount, projectSummaries, type ProjectSummary } from '@/lib/server/overview';
import { DatabaseUnreachable, SetupNeeded } from '@/lib/server/repo';
import { approverOf } from '@/lib/server/studio';
import { Greeting } from '@/components/Greeting';
import { helloIn, TZ_COOKIE } from '@/lib/engine/greeting';
import { EmailCode } from '@/components/EmailCode';
import { GoogleMark } from '@/components/GoogleMark';
import { HomeProjectCard } from '@/components/HomeProjectCard';
import { Icon } from '@/components/Icon';
import { LegalLinks } from '@/components/Legal';
import { sharedCount } from '@/lib/engine/together';
import { OCCASION_PRESETS } from '@/lib/design/occasions';
import { HOW_MONEY, HowItWorks } from '@/components/HowItWorks';
import { OutageNotice } from '@/components/Outage';
import { WelcomeCard } from '@/components/WelcomeCard';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string | string[] }> }) {
  const user = await getUser();
  if (!user) {
    const { signin } = await searchParams;
    return <Welcome refusal={REFUSALS.find((r) => r === signin)} />;
  }

  let projects: ProjectSummary[] = [];
  let archived = 0;
  // Only the admin can fix a broken service, so only they hear about it.
  let trouble: ServiceTrouble[] = [];
  try {
    [projects, archived] = await Promise.all([projectSummaries(user), archivedCount(user)]);
    if (user.admin) {
      const [ai, backups] = await Promise.all([aiTrouble(), backupTrouble()]);
      trouble = backups ? [...ai, backups] : ai;
    }
  } catch (e) {
    if (e instanceof DatabaseUnreachable) return <OutageNotice admin={ADMIN.name} problem={user.admin ? e.message : undefined} />;
    if (e instanceof SetupNeeded) return <SetupNotice isJoel={user.admin} problem={e.message} />;
    throw e;
  }

  const hello = helloIn((await cookies()).get(TZ_COOKIE)?.value);
  const others = (await membersOf(user.household)).filter((m) => m.id !== user.id);
  const other = others.length === 1 ? others[0].name : others.length ? 'The others' : 'Someone';
  const deciders = new Map(await Promise.all(projects.map(async (p) => [p.project.id, await nameOf(approverOf(p.project))] as const)));
  // On a laptop, a line per project that has something for you to do.
  const waiting = projects.filter((p) => p.project.status !== 'approved' && (p.unseen > 0 || p.matches > 0));
  // A household that's never made anything gets the first visit; someone who joined one that has gets a short welcome.
  const firstVisit = projects.length === 0 && archived === 0;
  const [household, welcome] = await Promise.all([getHousehold(user.household), needsWelcome(user)]);
  const householdName = household?.name ?? 'your household';

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6 lg:max-w-6xl lg:px-10 lg:pt-12">
      <header className="mb-8 flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
          <span className="font-display text-lg font-semibold">Our Studio</span>
        </div>
        {user.admin ? (
          <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-ink/5">
            <Icon name="settings" size={16} /> Setup
          </Link>
        ) : null}
      </header>

      <h1 className="font-display text-[34px] leading-tight font-semibold">
        <Greeting name={user.name} guess={hello} />
      </h1>
      <p className="mt-2 text-[16px] text-muted">
        {firstVisit ? `Welcome to ${householdName}. Here’s where to start, and how it works.` : 'Here’s what we’re deciding together.'}
      </p>

      {trouble.map((t) => (
        <Link key={t.provider} href="/admin" className="mt-5 block rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          <span className="font-semibold">{t.label} isn&apos;t working.</span> {t.message}
          <span className="mt-1 block text-sm">
            {t.effect} <span className="font-medium underline underline-offset-2">Open Setup</span>
          </span>
        </Link>
      ))}

      {waiting.length ? (
        <ul className="mt-6 hidden gap-3 lg:flex lg:flex-wrap">
          {waiting.map((p) => (
            <li key={p.project.id}>
              <Link
                href={`/p/${p.project.id}/${p.unseen ? 'browse' : 'favorites'}`}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lift)]"
              >
                <Icon name={p.unseen ? 'heart' : 'star'} size={18} className="text-lagoon" />
                <span>
                  <span className="font-medium">{p.project.title}:</span>{' '}
                  {p.theyLoved
                    ? `${other} loved ${p.theyLoved} you haven’t seen`
                    : p.unseen
                      ? `${p.unseen} new design${p.unseen === 1 ? '' : 's'} to look at`
                      : sharedCount(p.matches, others.length + 1)}
                </span>
                <Icon name="chevronRight" size={18} className="text-ink/30" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {firstVisit ? <FirstVisit alone={user.role === 'owner' && !others.length} /> : null}
      {!firstVisit && welcome ? <WelcomeCard household={householdName} /> : null}

      {firstVisit ? null : (
        <div className="mt-7 space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 xl:grid-cols-3">
          {projects.map((p) => (
            <HomeProjectCard
              key={p.project.id}
              project={p.project}
              pick={p.pick}
              shirt={p.shirt}
              members={others.length + 1}
              unseen={p.unseen}
              matches={p.matches}
              hearts={p.hearts}
              total={p.total}
              decider={approverOf(p.project) === user.id ? 'You have the final say' : `${deciders.get(p.project.id)} has the final say`}
            />
          ))}

          <Link
            href="/new"
            className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-line px-5 py-5 transition hover:border-lagoon/50 hover:bg-white/60"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lagoon text-white">
              <Icon name="plus" size={24} />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold">Start something new</span>
              <span className="block text-sm text-muted">A birthday, a graduation, another trip, or just because</span>
            </span>
          </Link>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
        {archived ? (
          <Link href="/archived" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline">
            <Icon name="archive" size={16} /> Archived ({archived})
          </Link>
        ) : null}
        <Link href="/activity" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline">
          <Icon name="clock" size={16} /> Activity
        </Link>
        <Link href="/household" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline lg:hidden">
          <Icon name="users" size={16} /> Household
        </Link>
        {firstVisit ? null : (
          <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline lg:hidden">
            <Icon name="info" size={16} /> How it works
          </Link>
        )}
        <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline lg:hidden">
          <Icon name="user" size={16} /> You
        </Link>
        {/* On a laptop it's at the foot of the sidebar. */}
        <form action="/api/logout" method="post" className="flex lg:hidden">
          <button className="inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 hover:underline">
            <Icon name="logout" size={16} /> Sign out
          </button>
        </form>
      </div>
      {/* On a laptop these sit at the foot of the sidebar. */}
      <LegalLinks home={false} className="mt-4 justify-center lg:hidden" />
    </main>
  );
}

/** Why the last sign-in didn't work. */
const REFUSED: Record<Refusal, string> = {
  off: 'Google sign-in isn’t set up yet.',
  cancelled: 'Sign-in was canceled. Try again whenever you like.',
  expired: 'That took a while, so it timed out. Try again.',
  failed: 'Google sign-in didn’t work that time. Try again in a moment.',
  'not-invited': 'That Google account isn’t on the list. Use the account you were invited with, or ask whoever invited you to add this one.',
  unverified: 'Google hasn’t confirmed that address yet, so it can’t be used to sign in.',
  'invite-gone': 'That invite can’t be used any more: it’s been used, cancelled or has run out. Ask whoever sent it for a new one.',
  closed: 'That account is closed. To come back, ask someone in one of your old households for a new invite.',
  'switched-off': 'That account has been switched off. Ask whoever runs the site.',
};

/**
 * A household's first visit: starting something front and centre (with the
 * occasions one tap away), a nudge to invite someone if they're on their own,
 * and how it all works.
 */
function FirstVisit({ alone }: { alone: boolean }) {
  return (
    <>
      <section aria-label="Start your first project" className="mt-7">
        <Link
          href="/new"
          className="flex items-center gap-4 rounded-3xl bg-lagoon px-5 py-5 text-white shadow-[0_10px_30px_-12px_rgb(14_124_134/0.7)] transition hover:bg-lagoon-deep active:scale-[0.99] lg:max-w-2xl"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Icon name="plus" size={26} />
          </span>
          <span>
            <span className="block font-display text-xl font-semibold">Start your first project</span>
            <span className="block text-[15px] text-white/85">Pick the occasion, add the details, and the first designs are ready in a moment.</span>
          </span>
        </Link>
        <p className="mb-2 mt-4 text-sm text-muted">Or jump straight to one:</p>
        <ul className="flex flex-wrap gap-2">
          {OCCASION_PRESETS.map((o) => (
            <li key={o.id}>
              <Link
                href={`/new?occasion=${o.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] shadow-[var(--shadow-card)] ring-1 ring-line hover:ring-ink/20"
              >
                <Icon name={o.icon} size={16} className="text-lagoon" />
                {o.short}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {alone ? (
        <Link href="/household" className="mt-6 flex items-center gap-3 rounded-3xl bg-sun-soft px-5 py-4 text-[15px] text-[#6b4f0c] lg:max-w-2xl">
          <Icon name="users" size={20} className="shrink-0" />
          <span>
            <span className="font-medium">Better with company.</span> Our Studio is for deciding together: invite the people you&apos;re making this with from
            Household.
          </span>
          <Icon name="chevronRight" size={18} className="ml-auto shrink-0" />
        </Link>
      ) : null}

      <section aria-labelledby="how-heading" className="mt-9">
        <h2 id="how-heading" className="mb-3 font-display text-xl font-semibold">
          How it works
        </h2>
        <HowItWorks />
        <p className="mt-3 text-sm text-muted">{HOW_MONEY}</p>
      </section>
    </>
  );
}

/** What Our Studio does, for the welcome page (which is also the public home page Google's review looks at). */
const ABOUT = [
  {
    icon: 'heart',
    text: 'Swipe through designs made for your occasion (a trip, a birthday, a graduation), heart the ones you like, and see the ones everyone loves.',
  },
  {
    icon: 'wand',
    text: 'Change the words, colors and artwork just by saying what you want, and see it in 3D before anything is made.',
  },
  {
    icon: 'check',
    text: 'Whoever has the final say approves it. Then print together, with print-ready files and a list of printers near you.',
  },
];

function Welcome({ refusal }: { refusal?: Refusal }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-16">
      <div className="flex flex-1 flex-col justify-center">
        <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl" />
        <h1 className="font-display text-[34px] leading-tight font-semibold">Our Studio</h1>
        <p className="mt-3 text-[17px] text-muted">Design together.</p>
        {refusal ? (
          <p role="alert" className="mt-6 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
            {REFUSED[refusal]}
          </p>
        ) : null}
        {config.googleSignIn ? (
          // A plain link, not a form: the trip to Google is a redirect, which the page's form rules would block.
          <a
            href="/api/auth/google"
            className="mt-8 flex h-12 items-center justify-center gap-3 rounded-full bg-white text-[16px] font-medium shadow-[var(--shadow-card)] ring-1 ring-line transition hover:ring-ink/20 active:scale-[0.98]"
          >
            <GoogleMark />
            Continue with Google
          </a>
        ) : null}
        {config.emailCodes ? <EmailCode folded={config.googleSignIn} /> : null}
        {config.devLogin ? null : config.linksConfigured ? (
          config.googleSignIn || config.emailCodes ? (
            <p className="mt-4 text-center text-sm text-muted">Or open the personal link you were sent.</p>
          ) : (
            <p className="mt-6 rounded-2xl bg-white px-4 py-3 text-[15px] shadow-[var(--shadow-card)]">
              To get in, open the personal link you were sent. It signs you in on this phone.
            </p>
          )
        ) : config.authConfigured ? null : (
          <p className="mt-6 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#8a6410]">
            Sign-in isn&apos;t set up yet. It needs Google sign-in, email codes, or personal links (<code>ERIN_LINK_TOKEN</code> and{' '}
            <code>JOEL_LINK_TOKEN</code>). See docs/SETUP.md.
          </p>
        )}
        {config.devLogin ? (
          <form action="/api/dev-login" method="post" className="mt-8 rounded-2xl bg-sun-soft p-4">
            <p className="mb-3 text-sm text-[#8a6410]">Running on a laptop without links set up. Who are you?</p>
            <div className="flex gap-2">
              <button name="who" value="erin" className="h-11 flex-1 rounded-full bg-lagoon font-medium text-white">
                I&apos;m Erin
              </button>
              <button name="who" value="joel" className="h-11 flex-1 rounded-full bg-white font-medium ring-1 ring-line">
                I&apos;m Joel
              </button>
            </div>
          </form>
        ) : null}

        <section aria-labelledby="about" className="mt-12">
          <h2 id="about" className="text-xs font-semibold uppercase tracking-wider text-muted">
            What it is
          </h2>
          <ul className="mt-3 space-y-3 text-[15px]">
            {ABOUT.map((a) => (
              <li key={a.icon} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lagoon-soft text-lagoon-deep">
                  <Icon name={a.icon} size={16} />
                </span>
                <span className="pt-1">{a.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Invite only. Some features use AI to suggest words and create artwork. The privacy page explains exactly what&apos;s shared, and with whom.
          </p>
        </section>
      </div>
      <LegalLinks home={false} className="mt-10 justify-center" />
    </main>
  );
}

function SetupNotice({ isJoel, problem }: { isJoel: boolean; problem: string }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">Almost ready</h1>
      {isJoel ? (
        <>
          <p className="mt-3 text-muted">The database isn&apos;t quite connected yet. Here&apos;s what it says:</p>
          <p className="mt-4 rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">{problem}</p>
          <Link href="/admin" className="mt-6 inline-flex h-11 items-center rounded-full bg-lagoon px-5 font-medium text-white">
            Open setup
          </Link>
        </>
      ) : (
        <p className="mt-3 text-muted">A couple of things are still being set up. Check back soon!</p>
      )}
    </main>
  );
}
