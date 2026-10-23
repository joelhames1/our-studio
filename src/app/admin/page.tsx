import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/server/auth';
import { setupStatus } from '@/lib/server/setup';
import { Icon } from '@/components/Icon';
import { CopyButton, CopyLinkButton, TestButton } from '@/components/AdminBits';
import { AdminOnly, byStatus, Code, Failing, Row, seconds, type Status } from './rows';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect(`/?next=${encodeURIComponent('/admin')}`);
  if (!user.admin) return <AdminOnly />;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${h.get('host')}`;
  const s = await setupStatus(origin);
  const claudeTrouble = s.trouble.find((t) => t.provider === 'anthropic');
  const artTrouble = s.trouble.find((t) => t.provider === s.art.provider);

  // Each service, whatever needs attention first. A sign-in method that isn't needed isn't shown.
  const rows: { ok: Status; title: string; hidden?: boolean; body: React.ReactNode }[] = [
    {
      ok: s.storage.ok,
      title: 'Database and file storage',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.backups.scheduled && !!s.backups.last && !s.backups.stale ? true : 'warn',
      title: 'Backups',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.alerts.on ? true : 'warn',
      title: 'Error alerts',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.google.on ? true : 'warn',
      title: 'Sign in with Google',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.codes.on ? true : 'warn',
      title: 'Email codes',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.links.configured || s.google.on || s.codes.on,
      title: 'Personal links', hidden: !s.links.configured && !s.links.off && (s.google.on || s.codes.on),
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: claudeTrouble ? false : s.claude.connected ? true : 'warn',
      title: 'Claude (words, tweaks, art direction)',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: artTrouble ? false : s.art.practice ? 'warn' : true,
      title: 'AI artwork',
      body: (
        <>
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
        </>
      ),
    },
    {
      ok: s.timings.every((t) => t.targetMs === null || t.typicalMs <= t.targetMs) ? true : 'warn',
      title: 'How long AI calls take',
      body: (
        <>
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
        </>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-5xl lg:px-8 lg:pt-10">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
      <h1 className="font-display text-[30px] font-semibold">Setup</h1>
      <p className="mt-1 text-muted">
        The services the site runs on, anything that needs attention first. Only you see this page, {user.name}. Full walkthrough: <Code>docs/SETUP.md</Code> in the repo.
      </p>
      <Link href="/admin/households" className="mb-6 mt-4 flex items-center gap-3 rounded-3xl bg-white px-5 py-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]">
        <Icon name="users" size={20} className="text-lagoon" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">All households</span>
          <span className="block text-sm text-muted">Invite a new household, AI budgets and spending, and everyone on the site</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-ink/30" />
      </Link>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        {rows
          .filter((r) => !r.hidden)
          .sort(byStatus)
          .map((r) => (
            <Row key={r.title} ok={r.ok} title={r.title}>
              {r.body}
            </Row>
          ))}
      </div>

      <form action="/api/logout" method="post" className="mt-10 text-center">
        <button className="text-sm text-muted underline underline-offset-4">Sign out on this device</button>
      </form>
    </main>
  );
}
