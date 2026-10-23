'use client';
import Link from 'next/link';
import { ShirtPreview } from './ShirtPreview';
import { Icon } from './Icon';
import { Pill } from './ui';
import type { Shirt } from '@/lib/server/overview';
import type { ShirtOption, ShirtProject } from '@/lib/server/studio';
import { sharedCount } from '@/lib/engine/together';

export function HomeProjectCard({
  project,
  pick,
  shirt,
  members,
  unseen,
  matches,
  hearts,
  total,
  decider,
}: {
  project: ShirtProject;
  pick: ShirtOption | null;
  shirt: Shirt;
  /** How many people are in the household. */
  members: number;
  unseen: number;
  matches: number;
  hearts: number;
  total: number;
  decider: string;
}) {
  const approved = project.status === 'approved';
  return (
    <Link
      prefetch={false}
      href={approved ? `/p/${project.id}/done` : `/p/${project.id}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lift)]"
    >
      <div className="bg-gradient-to-b from-lagoon-soft/70 to-sand-2 px-10 pt-6">
        {pick ? (
          <ShirtPreview design={pick.payload} copy={pick.payload.copyOverride ?? project.brief.copy} style={shirt.style} color={shirt.color} view="chest" />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">{project.title}</h2>
            {approved ? <Pill tone="lagoon">Approved</Pill> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {approved
              ? 'Print files are ready'
              : unseen > 0
                ? `${unseen} new design${unseen === 1 ? '' : 's'} to look at`
                : `All ${total} seen`}
            {!approved && matches > 0 ? ` · ${sharedCount(matches, members)}` : !approved && hearts > 0 ? ` · ${hearts} loved` : ''}
          </p>
          {!approved ? <p className="mt-0.5 text-xs text-muted/80">{decider}</p> : null}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lagoon text-white transition group-hover:translate-x-0.5">
          <Icon name="chevronRight" />
        </span>
      </div>
    </Link>
  );
}
