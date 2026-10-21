import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { ago, type ServiceTrouble } from '@/lib/server/health';
import { setupStatus } from '@/lib/server/setup';
import { Icon } from '@/components/Icon';
import { CopyButton, CopyLinkButton, HouseholdBudgets, TestButton } from '@/components/AdminBits';
import { InvitePanel } from '@/components/InvitePanel';

export const dynamic = 'force-dynamic';

function Row({ ok, title, children }: { ok: boolean | 'warn'; title: string; children: React.ReactNode }) {
  const tone = ok === true ? 'bg-lagoon text-white' : ok === 'warn' ? 'bg-sun text-ink' : 'bg-coral text-white';
  return (
    <section className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center gap-2.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tone}`}>
          <Icon name={ok === true ? 'check' : ok === 'warn' ? 'maybe' : 'x'} size={16} />
        </span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 text-[15px] text-ink/80">{children}</div>
    </section>
  );
}

/** A service whose recent calls are failing: when, what for, and what it said. */
function Failing({ t }: { t: ServiceTrouble }) {
  return (
    <div className="rounded-2xl bg-coral-soft px-3 py-2 text-coral">
      <p className="font-medium">
        Not working. The last call failed {ago(t.at)} ({t.note}):
      </p>
      <p className="mt-1">{t.message}</p>
      <p className="mt-1 text-sm">{t.effect} Once it&apos;s fixed, press Test it to clear this.</p>
    </div>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-md bg-sand-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>
);

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect('/');
  if (!user.admin) redirect('/');
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${h.get('host')}`;
  const s = await setupStatus(origin);
  /** What the households with limits of their own could spend between them. */
  const limitsTotal = s.budget.households.reduce((a, h) => a + (h.limit ?? 0), 0);
  const claudeTrouble = s.trouble.find((t) => t.provider === 'anthropic');
  const artTrouble = s.trouble.find((t) => t.provider === s.art.provider);

  return (
    <main className="mx-auto max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-5xl lg:px-8 lg:pt-10">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <h1 className="font-display text-[30px] font-semibold">Setup</h1>
      <p className="mb-6 mt-1 text-muted">Only you see this page, {user.name}. Full walkthrough: <Code>docs/SETUP.md</Code> in the repo.</p>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <Row ok={s.storage.ok} title="Database and file storage">
          <p>{s.storage.message}</p>
          {s.storage.kind === 'local' && s.isVercel === false ? (
            <p className="text-sm text-muted">Fine on a laptop. For the real thing (Vercel), connect Supabase.</p>
          ) : null}
          {!s.storage.ok && s.storage.kind === 'supabase' ? (
            <details className="rounded-2xl bg-sand p-3">
              <summary className="cursor-pointer font-medium">Show the one-time setup SQL</summary>
              <p className="my-2 text-sm">Supabase → SQL Editor → New query → paste → Run.</p>
              <CopyButton text={s.sql} label="Copy SQL" />
              <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-white p-3 text-xs">{s.sql}</pre>
            </details>
          ) : null}
          {s.storage.ok ? <TestButton target="storage" /> : null}
        </Row>

        <Row ok={s.backups.scheduled && !!s.backups.last && !s.backups.stale ? true : 'warn'} title="Backups">
          <p>
            {s.backups.last ? (
              <>
                Last copy {new Date(s.backups.last.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })}{' '}
                ({Object.values(s.backups.last.rows).reduce((a, n) => a + n, 0)} rows).
              </>
            ) : (
              'No copy yet.'
            )}{' '}
            {s.backups.stale && s.backups.scheduled
              ? 'That’s more than a day and a half ago, so the nightly run has probably stopped: check Vercel → the project → Settings → Cron Jobs.'
              : s.backups.scheduled
                ? 'A copy of the database is saved every night, and 30 days of them are kept, in the same private storage.'
                : 'Nightly copies are off until CRON_SECRET is set.'}
          </p>
          {s.backups.scheduled ? null : (
            <p className="text-sm">
              Vercel: add <Code>CRON_SECRET</Code> (Production only, type Secret), for example <Code>{s.backups.suggestedSecret}</Code>{' '}
              <CopyButton text={s.backups.suggestedSecret} label="Copy" />, then redeploy.
            </p>
          )}
          {s.storage.ok ? <TestButton target="backup" label="Back up now" /> : null}
        </Row>

        <Row ok={s.alerts.on ? true : 'warn'} title="Error alerts">
          {s.alerts.on ? (
            <p>
              On. When something breaks, an email goes to <Code>{s.alerts.to}</Code> from <Code>{s.alerts.from}</Code>: one an hour for each problem, and at
              most three an hour of each kind.
            </p>
          ) : (
            <p>
              Off. Add <Code>RESEND_API_KEY</Code> in Vercel{s.alerts.to ? '' : <>, and <Code>ALERT_EMAIL</Code> (or <Code>CONTACT_EMAIL</Code>) for where they go</>}, then
              redeploy. The setup guide has the steps.
            </p>
          )}
          {s.alerts.keySet ? <TestButton target="alert" label="Send a test" /> : null}
        </Row>

        <Row ok={s.households.stored && s.invites.ready ? true : 'warn'} title="Households">
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
              Run <Code>supabase/migrations/0006_households.sql</Code> (it&apos;s in the setup SQL below). The two of you move into the database as the first
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
              To invite people, run <Code>supabase/migrations/0007_invites_and_sessions.sql</Code> (it&apos;s in the setup SQL below). It adds invites and the list of
              signed-in devices.
            </p>
          ) : null}
        </Row>

        <Row ok={s.google.on ? true : 'warn'} title="Sign in with Google">
          {s.google.on ? (
            <>
              <p>
                On, {s.google.direct ? 'straight to Google' : 'through Supabase'}. Only addresses in a household get in; anyone else&apos;s Google account is turned
                away.
              </p>
              {s.google.clientTrouble ? <p className="text-sm text-coral">{s.google.clientTrouble}</p> : null}
              {s.google.direct ? null : (
                <details className="rounded-2xl bg-sand p-3" open>
                  <summary className="cursor-pointer font-medium">Switch to signing in straight with Google</summary>
                  <p className="my-2 text-sm">So Google&apos;s screen names this site instead of the supabase.co address. Nothing changes for sign-in until the redeploy in step 2.</p>
                  <ol className="list-decimal space-y-2 pl-5 text-sm">
                    <li>
                      <span className="font-medium">Google Cloud console</span> → Google Auth Platform → Clients → your web client. Under Authorized redirect URIs, add{' '}
                      <Code>{s.google.appCallback}</Code> <CopyButton text={s.google.appCallback} label="Copy" /> and save. Copy the client ID; if the secret
                      isn&apos;t shown any more, use <span className="font-medium">Add secret</span> and copy the new one.
                    </li>
                    <li>
                      <span className="font-medium">Vercel</span>: add <Code>GOOGLE_CLIENT_ID</Code> and <Code>GOOGLE_CLIENT_SECRET</Code>, Production only, type
                      Secret, then redeploy. This row then says &ldquo;straight to Google&rdquo;.
                    </li>
                    <li>
                      Check it in a private window, so you stay signed in here if something&apos;s off: Continue with Google should land you on the home screen.
                      Then tidy up: in Google, remove the supabase.co redirect URI and the supabase.co authorized domain; in Supabase, Authentication → Sign In /
                      Providers → Google → off, and delete your two old records under Authentication → Users.
                    </li>
                  </ol>
                </details>
              )}
              <details className="rounded-2xl bg-sand p-3">
                <summary className="cursor-pointer font-medium">For Google&apos;s brand verification</summary>
                <p className="my-2 text-sm">Only needed when someone beyond the two of you joins (see the setup guide). Google Auth Platform → Branding: copy these in, then publish the app and submit it for verification.</p>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    App home page <Code>{s.google.brand.home}</Code> <CopyButton text={s.google.brand.home} label="Copy" />
                  </li>
                  <li>
                    Privacy policy <Code>{s.google.brand.privacy}</Code> <CopyButton text={s.google.brand.privacy} label="Copy" />
                  </li>
                  <li>
                    Terms of service <Code>{s.google.brand.terms}</Code> <CopyButton text={s.google.brand.terms} label="Copy" />
                  </li>
                  <li>
                    Authorized domain <Code>{s.google.brand.domain}</Code> <CopyButton text={s.google.brand.domain} label="Copy" />
                    {s.google.direct ? <span className="text-muted"> (the only one: remove any supabase.co entry)</span> : null}
                  </li>
                  <li>
                    Contact address{' '}
                    {s.google.brand.contact ? (
                      <Code>{s.google.brand.contact}</Code>
                    ) : (
                      <span className="text-coral">
                        not set: add <Code>CONTACT_EMAIL</Code> in Vercel, so the privacy page and terms say where to write
                      </span>
                    )}
                  </li>
                </ul>
              </details>
              {s.links.configured && !s.links.off ? (
                <p className="text-sm text-muted">
                  Once you&apos;ve both signed in with Google, add <Code>SIGN_IN_LINKS=off</Code> in Vercel and redeploy. The personal links stop working;
                  phones already signed in stay signed in.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p>Two places, about 10 minutes. Use this site&apos;s real address ({s.google.origin}) when you do it.</p>
              {s.google.clientTrouble ? <p className="text-sm text-coral">{s.google.clientTrouble}</p> : null}
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <span className="font-medium">Google Cloud console</span>: make an OAuth client ID of type Web application, with the authorized redirect URI{' '}
                  <Code>{s.google.appCallback}</Code> <CopyButton text={s.google.appCallback} label="Copy" />. Leave the consent screen in Testing with both your Gmail
                  addresses as test users.
                </li>
                <li>
                  <span className="font-medium">Vercel</span>: add <Code>GOOGLE_CLIENT_ID</Code> and <Code>GOOGLE_CLIENT_SECRET</Code> from that client, and{' '}
                  <Code>ERIN_GOOGLE_EMAIL</Code> and <Code>JOEL_GOOGLE_EMAIL</Code> (the Google addresses you each sign in with), then redeploy.
                </li>
              </ol>
            </>
          )}
        </Row>

        <Row ok={s.codes.on ? true : 'warn'} title="Email codes">
          {s.codes.on ? (
            <>
              <p>
                On. Anyone without Google can choose &ldquo;Get a code by email&rdquo; on the sign-in screen. Codes only go to addresses in a household, from{' '}
                <Code>{s.codes.from}</Code>.
              </p>
              <p className="text-sm text-muted">
                A code lasts 10 minutes, works only in the browser that asked for it, and allows 5 tries. Each address gets at most 5 codes an hour.
              </p>
            </>
          ) : (
            <p>
              Off. For people without a Google account, it needs{' '}
              {[
                s.codes.keySet ? null : (
                  <span key="key">
                    <Code>RESEND_API_KEY</Code> (the same one the alerts use)
                  </span>
                ),
                s.codes.secret ? null : <span key="secret">the Supabase secret key</span>,
              ]
                .filter(Boolean)
                .flatMap((part, i) => (i ? [' and ', part] : [part]))}
              .
            </p>
          )}
        </Row>

        <Row ok={s.links.configured || s.google.on || s.codes.on} title="Personal links">
          {s.links.off ? (
            <p>
              Switched off (<Code>SIGN_IN_LINKS=off</Code>). Phones that signed in with a link stay signed in until they sign out. Remove the setting to switch
              links back on.
            </p>
          ) : s.links.configured ? (
            <>
              <p>Text each person their own link. Opening it signs them in on that phone for a year.</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-12 font-medium">Erin</span>
                <Code>{s.links.erin}</Code>
                <CopyLinkButton who="erin" label="Copy Erin's link" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-12 font-medium">Joel</span>
                <Code>{s.links.joel}</Code>
                <CopyLinkButton who="joel" label="Copy your link" />
              </div>
              <p className="text-sm text-muted">
                Lost phone? Change that person&apos;s token in Vercel and redeploy: their old link and every phone signed in with it stop working. To sign
                everyone out, change <Code>SESSION_VERSION</Code>.
              </p>
            </>
          ) : s.google.on || s.codes.on ? (
            <p>Not needed while Google sign-in or email codes are on.</p>
          ) : (
            <>
              {s.links.weak.length ? (
                <p className="rounded-2xl bg-coral-soft px-3 py-2 text-coral">
                  {s.links.weak.join(' and ')} {s.links.weak.length === 1 ? 'is' : 'are'} too short to be safe, so {s.links.weak.length === 1 ? 'it' : 'they'}{' '}
                  won&apos;t work. Use at least {s.links.minLength} random characters.
                </p>
              ) : null}
              <p>
                Add two secret environment variables, <Code>ERIN_LINK_TOKEN</Code> and <Code>JOEL_LINK_TOKEN</Code>. Here are two freshly made random ones you can use
                (or make your own with <Code>openssl rand -hex 24</Code>):
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={s.links.suggested.erin} label="Copy a token for Erin" />
                <CopyButton text={s.links.suggested.joel} label="Copy a token for Joel" />
              </div>
            </>
          )}
        </Row>

        <Row ok={claudeTrouble ? false : s.claude.connected ? true : 'warn'} title="Claude (words, tweaks, art direction)">
          {s.claude.connected ? (
            <>
              {claudeTrouble ? <Failing t={claudeTrouble} /> : null}
              <p>
                Connected, using <Code>{s.claude.model}</Code>. Writes word ideas, reads plain-English tweaks, art-directs, and checks artwork for stray lettering.
              </p>
              <TestButton target="claude" />
            </>
          ) : (
            <p>
              Optional but recommended. Add <Code>ANTHROPIC_API_KEY</Code>. Without it, tweaks use simple keyword matching and there are no new word ideas.
            </p>
          )}
        </Row>

        <Row ok={artTrouble ? false : s.art.practice ? 'warn' : true} title="AI artwork">
          {s.art.practice ? (
            <p>
              No image key yet, so new artwork uses the built-in practice artist (laptop only). Add <Code>FAL_KEY</Code> (recommended) or <Code>OPENAI_API_KEY</Code>.
            </p>
          ) : (
            <>
              {artTrouble ? <Failing t={artTrouble} /> : null}
              <p>
                Using <b>{s.art.label}</b> (<Code>{s.art.model}</Code>).
              </p>
              <TestButton target="art" />
            </>
          )}
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
              {!s.budget.editable ? <p className="text-sm text-muted">Changing them needs the households setup file run (see Households above).</p> : null}
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

        <Row ok={s.timings.every((t) => t.targetMs === null || t.typicalMs <= t.targetMs) ? true : 'warn'} title="How long AI calls take">
          {s.timings.length ? (
            <>
              <p>The last 30 days, from calls that finished: typical (half are quicker) and the slowest.</p>
              <ul className="divide-y divide-line/70 text-sm">
                {s.timings.map((t) => (
                  <li key={t.label} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                    <span className="text-muted">
                      {t.label} <span className="text-xs">({t.count})</span>
                    </span>
                    <span className={`tabular-nums ${t.targetMs !== null && t.typicalMs > t.targetMs ? 'text-coral' : ''}`}>
                      {seconds(t.typicalMs)} typical · {seconds(t.slowestMs)} slowest{t.targetMs !== null ? ` · aim ${seconds(t.targetMs)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nothing timed yet: each AI call is timed from now on, and the figures show up here.</p>
          )}
        </Row>
      </div>

      <form action="/api/logout" method="post" className="mt-10 text-center">
        <button className="text-sm text-muted underline underline-offset-4">Sign out on this device</button>
      </form>
    </main>
  );
}

/** "4.2 s", "1 min 30 s". */
function seconds(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const m = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec ? `${m} min ${sec} s` : `${m} min`;
}
