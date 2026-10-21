// Each project as one person sees it: what's new, what you both love, and the
// design to show for it. The home page, the desktop sidebar and the archive use it.
import type { GarmentStyle } from '@/lib/design/types';
import type { User } from '@/lib/engine/types';
import type { ShirtSnapshot } from '@/lib/kinds/shirt';
import { membersOf, names } from './people';
import { getRepo } from './repo';
import { canManage, ensureSeed, householdOf, type ShirtOption, type ShirtProject } from './studio';

export interface ProjectSummary {
  project: ShirtProject;
  total: number;
  unseen: number;
  matches: number;
  hearts: number;
  /** Designs the other person loved that you haven't looked at yet. */
  theyLoved: number;
  pick: ShirtOption | null;
  /** The shirt to show it on: the one it was approved on, or a plain white tee while it's still being decided. */
  shirt: Shirt;
}

export interface Shirt {
  style: GarmentStyle;
  color: string;
}

/** Every project in progress is shown on the same shirt, so the designs are what differ. */
const PLAIN: Shirt = { style: 'tee', color: 'white' };

async function summarize(project: ShirtProject, user: User): Promise<ProjectSummary> {
  const repo = getRepo();
  const [all, reactions] = await Promise.all([repo.listOptions(project.id), repo.listReactions(project.id)]);
  // Archived designs don't count anywhere.
  const options = all.filter((o) => o.kind === 'shirt' && !o.archived) as ShirtOption[];
  const mine = new Map(reactions.filter((r) => r.userId === user.id).map((r) => [r.optionId, r.value]));
  // Hearts from people still in the household; someone who left doesn't count.
  const members = new Set((await membersOf(householdOf(project))).map((m) => m.id));
  const theirLoves = new Set(reactions.filter((r) => r.userId !== user.id && r.value === 'love' && members.has(r.userId)).map((r) => r.optionId));
  const matchList = options.filter((o) => mine.get(o.id) === 'love' && theirLoves.has(o.id));
  const heartList = options.filter((o) => mine.get(o.id) === 'love');
  const decision = project.decisionId ? await repo.getDecision(project.decisionId) : null;
  const approved = decision ? ((all.find((o) => o.id === decision.optionId) as ShirtOption | undefined) ?? null) : null;
  const ordered = project.status === 'approved' ? (decision?.snapshot as Partial<ShirtSnapshot> | undefined) : undefined;
  return {
    project,
    total: options.length,
    unseen: options.filter((o) => !mine.has(o.id)).length,
    matches: matchList.length,
    hearts: heartList.length,
    theyLoved: options.filter((o) => !mine.has(o.id) && theirLoves.has(o.id)).length,
    pick: approved ?? matchList[0] ?? heartList[0] ?? options.find((o) => o.source === 'seed') ?? options[0] ?? null,
    shirt: ordered?.garment && ordered.color ? { style: ordered.garment, color: ordered.color } : PLAIN,
  };
}

/** The projects of the household `user` is working in. */
async function householdProjects(user: User): Promise<ShirtProject[]> {
  return ((await getRepo().listProjects()) as ShirtProject[]).filter((p) => householdOf(p) === user.household);
}

export async function projectSummaries(user: User): Promise<ProjectSummary[]> {
  await ensureSeed();
  const list = (await householdProjects(user))
    .filter((p) => !p.archived)
    // In progress first, then the most recently touched.
    .sort((a, b) => Number(a.status === 'approved') - Number(b.status === 'approved') || b.updatedAt.localeCompare(a.updatedAt));
  return Promise.all(list.map((p) => summarize(p, user)));
}

/** How many projects are in the archive, for the link to it. */
export async function archivedCount(user: User): Promise<number> {
  return (await householdProjects(user)).filter((p) => p.archived).length;
}

export interface ArchivedSummary extends ProjectSummary {
  startedBy: string;
  /** Null for projects archived before this was recorded. */
  archivedBy: string | null;
  archivedAt: string;
  canRestore: boolean;
  /** Why it can't be deleted, if it can't. */
  keep: string | null;
}


/** The archive, most recently archived first, with what tells same-named projects apart. */
export async function archivedSummaries(user: User): Promise<ArchivedSummary[]> {
  const known = await names();
  const nameOf = (id: string | undefined) => (!id || id === 'system' ? null : id === user.id ? 'you' : (known.get(id) ?? null));
  const list = (await householdProjects(user))
    .filter((p) => p.archived)
    .sort((a, b) => (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt));
  return Promise.all(
    list.map(async (project) => {
      const manage = canManage(user, project);
      return {
        ...(await summarize(project, user)),
        startedBy: nameOf(project.createdBy) ?? 'the studio',
        archivedBy: nameOf(project.archivedBy),
        archivedAt: project.archivedAt ?? project.updatedAt,
        canRestore: manage,
        keep: !manage
          ? null
          : project.keep
            ? 'This one’s kept for good'
            : project.status === 'approved'
              ? 'Approved, so its print files are kept'
              : null,
      };
    }),
  );
}
