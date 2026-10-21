import Link from 'next/link';
import type { ReactNode } from 'react';

/** The date at the top of the privacy page and the terms. Change it whenever either one changes. */
export const LEGAL_UPDATED = 'October 20, 2026';

/** A plain reading page for the privacy policy and terms: open to anyone, signed in or not. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8 sm:px-6 lg:pt-12">
      <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
        <span className="font-display text-lg font-semibold">Our Studio</span>
      </Link>
      <h1 className="font-display text-[32px] leading-tight font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-5 text-[16px] leading-relaxed">{intro}</div>
      <div className="mt-2 text-[16px] leading-relaxed">{children}</div>
      <LegalLinks className="mt-12 border-t border-line pt-5" />
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-muted">{children}</ul>;
}

/** "Home · Privacy · Terms", for the foot of public pages and the signed-in shell. */
export function LegalLinks({ className = '', home = true }: { className?: string; home?: boolean }) {
  const link = 'underline-offset-4 hover:underline';
  return (
    <nav aria-label="About this site" className={`flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted ${className}`}>
      {home ? (
        <Link href="/" className={link}>
          Home
        </Link>
      ) : null}
      <Link href="/privacy" className={link}>
        Privacy
      </Link>
      <Link href="/terms" className={link}>
        Terms
      </Link>
    </nav>
  );
}

/** How to reach whoever runs the site: the address from CONTACT_EMAIL, or the person who invited you. */
export function Contact({ email }: { email?: string }) {
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-lagoon-deep underline underline-offset-4">
      {email}
    </a>
  ) : (
    <span>the person who invited you</span>
  );
}
