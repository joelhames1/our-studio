import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ActivityAction, ActivityEntry, User } from '@/lib/engine/types';
import { activityFor } from '@/lib/server/activity';
import { ADMIN, getUser } from '@/lib/server/auth';
import { membersOf, names } from '@/lib/server/people';
import { householdOf } from '@/lib/server/studio';
import { getRepo } from '@/lib/server/repo';
import { When } from '@/components/ArchiveBits';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

const LOOK: Record<ActivityAction, { icon: string; verb: string; tone?: 'warn' }> = {
  'signed-in': { icon: 'key', verb: 'signed in' },
  'project-created': { icon: 'plus', verb: 'started' },
  approved: { icon: 'check', verb: 'approved' },
  reopened: { icon: 'undo', verb: 'reopened' },
  archived: { icon: 'archive', verb: 'archived' },
  restored: { icon: 'undo', verb: 'restored' },
  renamed: { icon: 'type', verb: 'renamed' },
  deleted: { icon: 'trash', verb: 'deleted', tone: 'warn' },
  'design-archived': { icon: 'archive', verb: 'archived' },
  'design-restored': { icon: 'undo', verb: 'restored' },
  limited: { icon: 'alert', verb: 'hit the limit on', tone: 'warn' },
  agreed: { icon: 'check', verb: 'agreed to' },
  'household-renamed': { icon: 'type', verb: 'renamed the household' },
  'approver-changed': { icon: 'users', verb: 'handed the final say on' },
  invited: { icon: 'send', verb: 'invited' },
  'invite-cancelled': { icon: 'x', verb: 'cancelled the invite for' },
  joined: { icon: 'users', verb: 'joined the household' },
  left: { icon: 'users', verb: 'left the household' },
  'member-removed': { icon: 'x', verb: 'took someone out of the household', tone: 'warn' },
  'role-changed': { icon: 'users', verb: 'changed who owns the household' },
  'account-closed': { icon: 'archive', verb: 'closed their account' },
  'account-switched-off': { icon: 'archive', verb: 'switched off an account', tone: 'warn' },
  'account-restored': { icon: 'undo', verb: 'restored an account' },
  'account-deleted': { icon: 'trash', verb: 'deleted their account', tone: 'warn' },
};

/** One line, in words: "Ana approved Abuela’s 80th · 12 shirts, front and back". */
function Line({ e, me, live, known }: { e: ActivityEntry; me: User; live: Set<string>; known: Map<string, string> }) {
  const who = e.by === me.id ? 'You' : (known.get(e.by) ?? 'Someone');
  const look = LOOK[e.action] ?? { icon: 'info', verb: e.action };
  const project = e.projectId ? (
    live.has(e.projectId) && e.action !== 'deleted' ? (
      <Link href={`/p/${e.projectId}`} className="font-medium underline-offset-4 hover:underline">
        {e.projectTitle ?? 'a project'}
      </Link>
    ) : (
      <span className="font-medium">{e.projectTitle ?? 'a project'}</span>
    )
  ) : null;
  let text: React.ReactNode;
  switch (e.action) {
    case 'signed-in':
      text = <>{who} signed in {e.detail}</>;
      break;
    case 'limited':
      text = <>{who} hit the limit on {e.detail}</>;
      break;
    case 'agreed':
      text = <>{who} agreed to how Our Studio uses AI</>;
      break;
    case 'approver-changed':
      text = <>{who} handed the final say on {project} {e.detail ?? ''}</>;
      break;
    case 'household-renamed':
      text = <>{who} renamed the household {e.detail ? <span className="text-muted">({e.detail})</span> : null}</>;
      break;
    case 'design-archived':
    case 'design-restored':
      text = <>{who} {look.verb} {e.detail ?? 'a design'} in {project}</>;
      break;
    case 'renamed':
      text = <>{who} renamed {project} {e.detail ? <span className="text-muted">({e.detail})</span> : null}</>;
      break;
    case 'invited':
    case 'invite-cancelled':
      text = <>{who} {look.verb} {e.detail ?? 'someone'}</>;
      break;
    case 'joined':
      // Whoever starts a household joins it first; that's one thing, not two.
      text = e.detail === 'and started it' ? <>{who} started the household</> : <>{who} joined the household {e.detail ? <span className="text-muted">· {e.detail}</span> : null}</>;
      break;
    case 'left':
    case 'account-closed':
    case 'account-deleted':
      text = <>{who} {look.verb} {e.detail ? <span className="text-muted">· {e.detail}</span> : null}</>;
      break;
    case 'member-removed':
      text = <>{who} took {e.detail ?? 'someone'} out of the household</>;
      break;
    case 'account-switched-off':
      text = <>{who} switched off {e.detail ?? 'someone'}&apos;s account</>;
      break;
    case 'account-restored':
      text = <>{who} restored {e.detail ?? 'someone'}&apos;s account</>;
      break;
    case 'role-changed':
      text = <>{who} made {e.detail ?? 'someone'}</>;
      break;
    case 'deleted':
      text = <>{who} deleted {project} for good {e.detail ? <span className="text-muted">· {e.detail}</span> : null}</>;
      break;
    default:
      text = <>{who} {look.verb} {project} {e.detail ? <span className="text-muted">· {e.detail}</span> : null}</>;
  }
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${look.tone === 'warn' ? 'bg-coral-soft text-coral' : 'bg-sand-2 text-ink/70'}`}>
        <Icon name={look.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">{text}</span>
        <span className="mt-0.5 block text-sm text-muted">
          <When iso={e.at} time />
        </span>
      </span>
    </li>
  );
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ project?: string | string[]; before?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect('/');
  const sp = await searchParams;
  const projectId = typeof sp.project === 'string' && sp.project ? sp.project : undefined;
  const before = typeof sp.before === 'string' && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const repo = getRepo();
  const [page, all, known, members] = await Promise.all([activityFor(user, { projectId, before, limit: 50 }), repo.listProjects(), names(), membersOf(user.household)]);
  const projects = all.filter((p) => householdOf(p) === user.household);
  const live = new Set(projects.map((p) => p.id));
  const owner = members.find((m) => m.role === 'owner')?.name ?? 'The owner';
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const name = project?.title ?? page.entries.find((e) => e.projectTitle)?.projectTitle;
  const here = (extra: Record<string, string>) => `/activity?${new URLSearchParams({ ...(projectId ? { project: projectId } : {}), ...extra })}`;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 lg:max-w-3xl lg:px-10 lg:pt-12">
      <Link href={project ? `/p/${project.id}` : '/'} className="mb-4 inline-flex items-center gap-1 text-sm text-muted lg:hidden">
        <Icon name="chevronLeft" size={16} /> {project ? project.title : 'Home'}
      </Link>
      <h1 className="font-display text-[30px] leading-tight font-semibold">Activity</h1>
      <p className="mb-6 mt-1 text-muted">
        {projectId
          ? `Everything that's happened to ${name ? `“${name}”` : 'this project'}, newest first.`
          : `Approvals, archives, renames, deletes and sign-ins, newest first.${user.role === 'owner' ? '' : ' You see your own sign-ins; ' + owner + ' sees everyone’s.'}`}
      </p>

      {page.missing ? (
        <p className="rounded-2xl bg-sun-soft px-4 py-3 text-[15px] text-[#6b4f0c]">
          {user.admin ? (
            <>
              The activity log needs one more setup step: run <code className="text-sm">supabase/migrations/0005_activity_and_limits.sql</code> in Supabase&apos;s SQL Editor. It&apos;s also in the setup SQL on the{' '}
              <Link href="/admin" className="underline underline-offset-2">
                Setup page
              </Link>
              .
            </>
          ) : (
            `The activity log isn’t switched on yet. ${ADMIN.name} has one setup step to do.`
          )}
        </p>
      ) : page.entries.length ? (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
          {page.entries.map((e) => (
            <Line key={e.id} e={e} me={user} live={live} known={known} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-muted shadow-[var(--shadow-card)]">
          {before ? 'Nothing older.' : 'Nothing yet. Approvals, archives, renames and sign-ins will show up here.'}
        </p>
      )}

      {page.next || before ? (
        <div className="mt-5 flex justify-center gap-5 text-sm text-muted">
          {before ? (
            <Link href={here({})} className="underline underline-offset-4">
              Newest
            </Link>
          ) : null}
          {page.next ? (
            <Link href={here({ before: page.next })} className="underline underline-offset-4">
              Older
            </Link>
          ) : null}
        </div>
      ) : null}
      {projectId ? (
        <div className="mt-5 text-center text-sm text-muted">
          <Link href="/activity" className="underline underline-offset-4">
            All activity
          </Link>
        </div>
      ) : null}
    </main>
  );
}
