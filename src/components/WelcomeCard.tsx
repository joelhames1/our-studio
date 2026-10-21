'use client';
import { useState } from 'react';
import { http } from '@/lib/client/http';
import { HOW_MONEY, HowItWorks } from './HowItWorks';
import { Button } from './ui';

/** "New here?": the four steps for someone who joined a household that already has projects, until they say Got it. */
export function WelcomeCard({ household }: { household: string }) {
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (gone) return null;
  const done = async () => {
    setBusy(true);
    // Hidden straight away; if saving it fails, it just shows again next time.
    setGone(true);
    await http('/api/account/welcomed', { body: {} }).catch(() => undefined);
  };
  return (
    <section aria-labelledby="welcome-heading" className="mt-6 rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">New here?</p>
      <h2 id="welcome-heading" className="mb-4 mt-1 font-display text-xl font-semibold">
        How {household} works, in four steps
      </h2>
      <HowItWorks compact />
      <p className="mt-4 text-sm text-muted">{HOW_MONEY}</p>
      <Button size="sm" className="mt-4" onClick={done} busy={busy}>
        Got it
      </Button>
    </section>
  );
}
