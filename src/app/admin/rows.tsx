// The pieces Setup and All households are built from: a status card, a failing
// service's last error, and inline code.
import Link from 'next/link';
import { ago, type ServiceTrouble } from '@/lib/server/health';
import { Icon } from '@/components/Icon';

export type Status = boolean | 'warn';

export function Row({ ok, title, children }: { ok: Status; title: string; children: React.ReactNode }) {
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
export function Failing({ t }: { t: ServiceTrouble }) {
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

export const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded-md bg-sand-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>
);

/** Whatever needs attention first: broken, then worth a look, then fine. */
export const byStatus = (a: { ok: Status }, b: { ok: Status }) => rank(a.ok) - rank(b.ok);
const rank = (ok: Status) => (ok === false ? 0 : ok === 'warn' ? 1 : 2);

/** "4.2 s", "1 min 30 s". */
export function seconds(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const m = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec ? `${m} min ${sec} s` : `${m} min`;
}

/** For anyone but whoever runs the site who opens one of these pages: what it is, and the way home. */
export function AdminOnly() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">This page is for whoever runs Our Studio</h1>
      <p className="mt-3 text-muted">It&apos;s where the site&apos;s services and households are looked after. Everything for your own household is under Household.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-lagoon px-5 font-medium text-white">
          Go home
        </Link>
        <Link href="/household" className="inline-flex h-11 items-center rounded-full bg-white px-5 font-medium ring-1 ring-line">
          Household
        </Link>
      </div>
    </main>
  );
}
