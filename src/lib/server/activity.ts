// The activity log: who approved, reopened, archived, renamed or deleted what,
// and when, plus sign-ins and hitting a rate limit. Recording never gets in the
// way: if the log can't be written, the action still happens.
import 'server-only';
import type { ActivityAction, ActivityEntry, Project, User } from '@/lib/engine/types';
import { newId } from './ids';
import { directoryCounts, FIRST_HOUSEHOLD } from './people';
import { getRepo, SetupNeeded } from './repo';

export async function record(
  user: User,
  action: ActivityAction,
  about: { project?: Pick<Project, 'id' | 'title' | 'householdId'>; optionId?: string; detail?: string } = {},
): Promise<void> {
  const entry: ActivityEntry = {
    id: newId(),
    at: new Date().toISOString(),
    by: user.id,
    action,
    // A project's entries go in its household's log; anything else in the one they're working in.
    householdId: about.project ? (about.project.householdId ?? FIRST_HOUSEHOLD) : user.household,
    ...(about.project ? { projectId: about.project.id, projectTitle: about.project.title } : {}),
    ...(about.optionId ? { optionId: about.optionId } : {}),
    ...(about.detail ? { detail: about.detail.slice(0, 200) } : {}),
  };
  try {
    await getRepo().addActivity(entry);
  } catch (e) {
    console.error('Activity log write failed:', (e as Error).message);
  }
}

/** Entries about a person rather than a project: only they and their household's owner see them. */
const PERSONAL = new Set<ActivityAction>(['signed-in', 'agreed']);

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Pass back as `before` for the next page; null at the end. */
  next: string | null;
  /** The log's table isn't set up yet (0005_activity_and_limits.sql). */
  missing: boolean;
}

/**
 * The household's log, newest first, as `user` may see it. Everyone sees what
 * happened to its projects; sign-ins and agreements are only shown to the
 * person themselves and the household's owner. Other households' entries never
 * show, for anyone.
 */
export async function activityFor(user: User, opts: { projectId?: string; before?: string; limit?: number } = {}): Promise<ActivityPage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let raw: ActivityEntry[];
  try {
    // Before households are set up there's only the one, and its older entries aren't marked yet.
    const households = await directoryCounts();
    raw = await getRepo().listActivity({ projectId: opts.projectId, before: opts.before, household: households ? user.household : undefined, limit: limit + 1 });
  } catch (e) {
    if (e instanceof SetupNeeded && /(isn’t|aren’t) there yet/.test(e.message)) return { entries: [], next: null, missing: true };
    throw e;
  }
  const more = raw.length > limit;
  const page = raw.slice(0, limit);
  const entries = page.filter((e) => !PERSONAL.has(e.action) || user.role === 'owner' || e.by === user.id);
  return { entries, next: more ? page[page.length - 1].at : null, missing: false };
}
