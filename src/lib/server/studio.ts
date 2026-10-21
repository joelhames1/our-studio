// Server-side business logic shared by pages and API routes.
import { blankFacts, cleanFacts, OCCASIONS } from '@/lib/design/back/facts';
import { backKey, freshBacks, similarBacks, starterBacks } from '@/lib/design/back/generate';
import { names, preset } from '@/lib/design/occasions';
import type { BackDesign, Facts, Occasion } from '@/lib/design/back/types';
import { designKey, generateFresh, generateSimilar, seeded } from '@/lib/design/generate';
import { safeCopy, safeDesign } from '@/lib/design/safe';
import { COPY_IDEAS, SAMPLE_ART_IDEAS, SAMPLE_ART_VIBES, SAMPLE_CONTEXT, SAMPLE_FACTS, SEED_COPY, SEED_DESIGN, SEED_TICKET } from '@/lib/design/seed';
import type { Copy, ShirtDesign } from '@/lib/design/types';
import { vibe as getVibe } from '@/lib/design/vibes';
import type { Decision, OptionRecord, OptionSource, Project, Reaction, ReactionValue, User, UserId } from '@/lib/engine/types';
import { BACK, FRONT, type ShirtBrief, type ShirtSnapshot } from '@/lib/kinds/shirt';
import { record } from './activity';
import { setHousehold } from './context';
import { HttpError, requireUser } from './auth';
import { config } from './config';
import { FIRST_HOUSEHOLD, membersOf, nameOf } from './people';
import { getRepo } from './repo';

import { newId } from './ids';
export { newId };
const now = () => new Date().toISOString();

/** The made-up sample project a laptop (and the tests) start with. Never made in production. */
export const SEED_PROJECT_ID = 'sample-shirt';

export type ShirtProject = Project<ShirtBrief>;
export type ShirtOption = OptionRecord<ShirtDesign>;
export type BackOption = OptionRecord<BackDesign>;

const SAMPLE_OCCASIONS: Occasion[] = ['trip', 'anniversary'];

export function occasionsOf(project: ShirtProject): Occasion[] {
  return project.brief.occasions ?? ['everyday'];
}

/** The project's back details (older projects get sensible ones). */
export function factsOf(project: ShirtProject): Facts {
  return project.brief.facts ?? blankFacts(occasionsOf(project)[0] ?? 'everyday');
}

/** Who gives the final approval on a project: whoever it was handed to, else whoever started it. */
export function approverOf(project: Pick<ShirtProject, 'approver' | 'createdBy'>): UserId {
  return project.approver ?? (project.createdBy && project.createdBy !== 'system' ? project.createdBy : '');
}

export function canApprove(user: User, project: Pick<ShirtProject, 'approver' | 'createdBy'>): boolean {
  return approverOf(project) === user.id;
}

/** Who can hand the final say to someone else: whoever has it, whoever started the project, or the household's owner. Not once it's approved. */
export function canChooseApprover(user: User, project: Pick<ShirtProject, 'approver' | 'createdBy' | 'householdId' | 'status'>): boolean {
  return project.status !== 'approved' && (canApprove(user, project) || canManage(user, project));
}

/** Gives the final say to someone else in the household. */
export async function setApprover(user: User, projectId: string, approverId: unknown): Promise<ShirtProject> {
  const project = await projectFor(user, projectId);
  if (project.status === 'approved') throw new HttpError(409, 'It’s already approved. Reopen it first to change who decides.');
  if (!canChooseApprover(user, project)) throw new HttpError(403, `Only ${await nameOf(approverOf(project))}, whoever started it, or the household’s owner can change who decides.`);
  const to = (await membersOf(householdOf(project))).find((m) => m.id === approverId);
  if (!to) throw new HttpError(400, 'Pick someone in the household.');
  if (approverOf(project) === to.id) return project;
  project.approver = to.id;
  project.updatedAt = now();
  await getRepo().saveProject(project);
  await record(user, 'approver-changed', { project, detail: `to ${to.name}` });
  return project;
}

/** Whose project it is: projects from before households are the first household's. */
export function householdOf(project: Pick<Project, 'householdId'>): string {
  return project.householdId ?? FIRST_HOUSEHOLD;
}

/** Archiving, restoring and deleting a project: whoever started it, or the household's owner. */
export function canManage(user: User, project: Pick<ShirtProject, 'createdBy' | 'householdId'>): boolean {
  const household = householdOf(project);
  // Whoever started it, while they're still in its household; or an owner of that household.
  return user.households.includes(household) && (project.createdBy === user.id || user.roles[household] === 'owner');
}

/** What Claude is told about the project before it writes words or art-directs. */
export function contextOf(project: ShirtProject): string {
  if (project.brief.context) return project.brief.context;
  const facts = factsOf(project);
  const who = names(facts.people);
  return `They're making T-shirts for ${preset(occasionsOf(project)[0]).noun}: "${project.title}".${who ? ` The people: ${who}.` : ''}${facts.dates ? ` When: ${facts.dates}.` : ''} Their taste: fun and a little cheeky, never crude.`;
}

/** Subjects for AI artwork when Claude isn't there to come up with its own. */
export function artIdeasOf(project: ShirtProject): string[] {
  if (project.brief.artIdeas?.length) return project.brief.artIdeas;
  return [...new Set(occasionsOf(project).flatMap((o) => preset(o).artIdeas))];
}

/** Starter backs, with ids derived from the project so a double seed is harmless. */
export function starterBackOptions(project: ShirtProject, t: string, skip = 0): BackOption[] {
  return starterBacks(occasionsOf(project), factsOf(project)).map((payload, i) => ({
    id: `${project.id}-back-${skip + i + 1}`,
    projectId: project.id,
    kind: BACK,
    createdAt: new Date(Date.parse(t) + i).toISOString(),
    createdBy: 'system' as const,
    source: 'seed' as const,
    batch: `${project.id}-backs`,
    payload,
  }));
}

/** On a laptop (and in the tests), starts the made-up sample project the first time anyone opens the app. Never in production. */
export async function ensureSeed(): Promise<void> {
  const repo = getRepo();
  if (repo.name !== 'local' || (await repo.getProject(SEED_PROJECT_ID))) return;
  const t = now();
  const project: ShirtProject = {
    id: SEED_PROJECT_ID,
    kind: 'shirt',
    title: 'Sample Shirt',
    createdAt: t,
    updatedAt: t,
    status: 'exploring',
    householdId: FIRST_HOUSEHOLD,
    decisionId: null,
    createdBy: 'joel',
    approver: 'erin',
    keep: true,
    brief: {
      copy: SEED_COPY,
      vibes: [],
      ticket: SEED_TICKET,
      copyIdeas: COPY_IDEAS,
      occasions: SAMPLE_OCCASIONS,
      facts: SAMPLE_FACTS,
      context: SAMPLE_CONTEXT,
      artIdeas: SAMPLE_ART_IDEAS,
      artVibes: SAMPLE_ART_VIBES,
    },
  };
  const seed: ShirtOption = {
    id: newId(),
    projectId: project.id,
    kind: 'shirt',
    createdAt: t,
    createdBy: 'joel',
    source: 'seed',
    label: 'The original idea',
    payload: { ...SEED_DESIGN, ticket: SEED_TICKET },
  };
  const batch = newId();
  const starters = generateFresh({ vibes: [], count: 15, exclude: new Set([designKey(SEED_DESIGN)]), rand: seeded(31), occasions: SAMPLE_OCCASIONS });
  const options: ShirtOption[] = [
    seed,
    ...starters.map((payload, i) => ({
      id: newId(),
      projectId: project.id,
      kind: 'shirt',
      // Keep the seed first when sorted by time.
      createdAt: new Date(Date.parse(t) + i + 1).toISOString(),
      createdBy: 'system' as const,
      source: 'remix' as const,
      batch,
      payload: { ...payload, ticket: SEED_TICKET },
    })),
  ];
  await repo.saveProject(project);
  await repo.saveOptions([...options, ...starterBackOptions(project, t)]);
}

export async function getShirtProject(id: string): Promise<ShirtProject> {
  const p = (await getRepo().getProject(id)) as ShirtProject | null;
  if (!p) throw new HttpError(404, 'That project does not exist.');
  return p;
}

/**
 * The project, if `user` belongs to its household. Every route and page that
 * takes a project id starts here; to anyone else it doesn't exist.
 */
export async function projectFor(user: User, id: string): Promise<ShirtProject> {
  const p = await getShirtProject(id);
  if (!user.households.includes(householdOf(p))) throw new HttpError(404, 'That project does not exist.');
  return p;
}

/** Whoever's signed in, and the project, if they belong to its household. The first line of every project route. */
export async function requireMember(projectId: string): Promise<{ me: User; project: ShirtProject }> {
  const me = await requireUser();
  const project = await projectFor(me, projectId);
  // AI spent on this project comes out of its household's budget.
  setHousehold(householdOf(project));
  return { me, project };
}

export interface ProjectState {
  me: User;
  project: ShirtProject;
  /** Front designs, not counting archived ones. */
  options: ShirtOption[];
  /** Back designs, not counting archived ones. */
  backs: BackOption[];
  /** Designs put away for everyone, fronts and backs, newest first. */
  archived: ShirtOption[];
  archivedBacks: BackOption[];
  facts: Facts;
  occasions: Occasion[];
  /** Your reactions, plus other people's hearts (their passes stay private). */
  reactions: Reaction[];
  decision: Decision<ShirtSnapshot> | null;
  ai: { art: boolean; words: boolean; artProvider: string };
  /** Whether you give the final approval here, and who does. */
  canApprove: boolean;
  approverName: string;
  /** Whether you can archive, restore or delete the project (whoever started it, or the household's owner). */
  canManage: boolean;
  /** Everyone in the project's household. */
  members: { id: string; name: string }[];
  /** Whether you can hand the final say to someone else. */
  canChooseApprover: boolean;
}

export async function projectState(id: string, me: User): Promise<ProjectState> {
  const repo = getRepo();
  // The designs and hearts are asked for alongside the project rather than after it: one trip to the database
  // fewer on every project page. Nothing from them is used unless the membership check passes.
  const early = Promise.all([repo.listOptions(id), repo.listReactions(id)]);
  early.catch(() => undefined);
  const project = await projectFor(me, id);
  const [[all, reactions], decision, members, approverName] = await Promise.all([
    early,
    project.decisionId ? (repo.getDecision(project.decisionId) as Promise<Decision<ShirtSnapshot> | null>) : Promise.resolve(null),
    membersOf(householdOf(project)),
    nameOf(approverOf(project)),
  ]);
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let backs = all.filter((o) => o.kind === BACK) as BackOption[];
  // Projects made before backs existed get their starter backs on first look.
  if (!backs.length && project.kind === 'shirt') {
    backs = starterBackOptions(project, project.createdAt);
    await repo.saveOptions(backs);
  }
  const fronts = all.filter((o) => o.kind === FRONT) as ShirtOption[];
  const putAway = <T extends OptionRecord>(list: T[]) => list.filter((o) => o.archived).sort((a, b) => b.archived!.at.localeCompare(a.archived!.at));
  return {
    me,
    project,
    options: fronts.filter((o) => !o.archived),
    backs: backs.filter((o) => !o.archived),
    archived: putAway(fronts),
    archivedBacks: putAway(backs),
    canManage: canManage(me, project),
    facts: factsOf(project),
    occasions: occasionsOf(project),
    canApprove: canApprove(me, project),
    approverName,
    members: members.map((m) => ({ id: m.id, name: m.name })),
    canChooseApprover: canChooseApprover(me, project),
    // Hearts from people still in the household (someone who left doesn't count), and your own of every kind.
    reactions: reactions.filter((r) => r.userId === me.id || (r.value === 'love' && members.some((m) => m.id === r.userId))),
    decision,
    ai: {
      // The practice artist (no key) is allowed on a laptop, never in production.
      art: config.imageProvider !== 'mock' || !config.isProduction,
      words: !!config.anthropicKey,
      artProvider: config.imageProvider,
    },
  };
}

export interface BriefPatch {
  copy?: Copy;
  vibes?: string[];
  facts?: Partial<Facts>;
  occasions?: Occasion[];
}

export async function updateBrief(id: string, patch: BriefPatch): Promise<ShirtProject> {
  const repo = getRepo();
  const project = await getShirtProject(id);
  if (patch.copy !== undefined) {
    const c = safeCopy(patch.copy);
    if (!c) throw new HttpError(400, 'Those words didn’t come through. Try again?');
    const clean = (s: string) => s.replace(/\s+$/g, '');
    project.brief.copy = { headline: clean(c.headline), tagline: clean(c.tagline), extra: clean(c.extra) };
  }
  if (patch.vibes !== undefined) {
    if (!Array.isArray(patch.vibes)) throw new HttpError(400, 'Those styles didn’t come through. Try again?');
    project.brief.vibes = [...new Set(patch.vibes.filter((v): v is string => typeof v === 'string' && !!getVibe(v)))].slice(0, 8);
  }
  const hadFacts = factsOf(project);
  if (patch.facts) project.brief.facts = cleanFacts(patch.facts, hadFacts);
  if (Array.isArray(patch.occasions)) {
    const known = new Set<unknown>(OCCASIONS.map((o) => o.id));
    project.brief.occasions = patch.occasions.filter((o) => known.has(o)).slice(0, 4);
  }
  project.updatedAt = now();
  await repo.saveProject(project);
  if (patch.facts) await addUnlockedBacks(project);
  return project;
}

/**
 * When new details make a back template possible (a route added to a birthday
 * trip, say), its starter backs join the list.
 */
async function addUnlockedBacks(project: ShirtProject): Promise<void> {
  const repo = getRepo();
  const backs = (await repo.listOptions(project.id)).filter((o) => o.kind === BACK) as BackOption[];
  const have = new Set(backs.map((b) => b.payload.template));
  const missing = starterBacks(occasionsOf(project), factsOf(project)).filter((d) => !have.has(d.template));
  if (missing.length) await addBackOptions(project.id, 'system', 'remix', missing);
}

export async function react(user: User, projectId: string, optionId: string, value: ReactionValue | null, note?: string) {
  const repo = getRepo();
  const option = await repo.getOption(optionId);
  if (!option || option.projectId !== projectId) throw new HttpError(404, 'That design is gone.');
  if (value === null) {
    await repo.deleteReaction(optionId, user.id);
    return null;
  }
  const r: Reaction = { projectId, optionId, userId: user.id, value, note: typeof note === 'string' ? note.slice(0, 500) : undefined, updatedAt: now() };
  await repo.saveReaction(r);
  return r;
}

/** Designs one project can hold, fronts and backs, archived or not: far past what anyone browses, short of what a script could pile up. */
export const MAX_DESIGNS = 1000;

/** Refuses more designs once a project is full. */
async function roomFor(projectId: string, adding: number): Promise<void> {
  if ((await getRepo().listOptions(projectId)).length + adding > MAX_DESIGNS) {
    throw new HttpError(409, `This project has ${MAX_DESIGNS} designs already, which is as many as one holds. Start a fresh project for new ideas.`);
  }
}

export async function addOptions(
  projectId: string,
  user: UserId | 'system',
  source: OptionSource,
  designs: ShirtDesign[],
  extra: { parentId?: string | null; label?: string } = {},
): Promise<ShirtOption[]> {
  await roomFor(projectId, designs.length);
  const batch = newId();
  const t = Date.now();
  // Boarding-pass designs read the trip from the project.
  const brief = designs.some((d) => !d.ticket) ? ((await getRepo().getProject(projectId)) as ShirtProject | null)?.brief : undefined;
  const options: ShirtOption[] = designs.map((payload, i) => ({
    id: newId(),
    projectId,
    kind: FRONT,
    createdAt: new Date(t + i).toISOString(),
    createdBy: user,
    source,
    parentId: extra.parentId ?? null,
    batch,
    label: extra.label,
    payload: safeDesign(payload.ticket || !brief ? payload : { ...payload, ticket: brief.ticket }),
  }));
  await getRepo().saveOptions(options);
  return options;
}

/** Zero-AI remix: either "more like this" or a fresh batch from the chosen vibes. */
export async function remix(user: User, projectId: string, parentId: string | null, count = 6): Promise<ShirtOption[]> {
  const repo = getRepo();
  const project = await getShirtProject(projectId);
  const existing = (await repo.listOptions(projectId)).filter((o) => o.kind === FRONT) as ShirtOption[];
  const exclude = new Set(existing.map((o) => designKey(o.payload)));
  const rand = seeded(Date.now() ^ existing.length);
  let designs: ShirtDesign[];
  if (parentId) {
    const parent = existing.find((o) => o.id === parentId);
    if (!parent) throw new HttpError(404, 'That design is gone.');
    designs = generateSimilar(parent.payload, { vibes: project.brief.vibes, count, exclude, rand, occasions: occasionsOf(project) });
  } else {
    designs = generateFresh({ vibes: project.brief.vibes, count, exclude, rand, occasions: occasionsOf(project) });
  }
  designs = designs.map((d) => ({ ...d, ticket: d.ticket ?? project.brief.ticket }));
  return addOptions(projectId, user.id, 'remix', designs, { parentId });
}

// --- backs ---------------------------------------------------------------------------

export async function getBackOption(projectId: string, optionId: string): Promise<BackOption> {
  const option = await getRepo().getOption(optionId);
  if (!option || option.projectId !== projectId || option.kind !== BACK) throw new HttpError(404, 'That back is gone.');
  return option as BackOption;
}

export async function addBackOptions(
  projectId: string,
  user: UserId | 'system',
  source: OptionSource,
  designs: BackDesign[],
  extra: { parentId?: string | null; label?: string } = {},
): Promise<BackOption[]> {
  await roomFor(projectId, designs.length);
  const batch = newId();
  const t = Date.now();
  const options: BackOption[] = designs.map((payload, i) => ({
    id: newId(),
    projectId,
    kind: BACK,
    createdAt: new Date(t + i).toISOString(),
    createdBy: user,
    source,
    parentId: extra.parentId ?? null,
    batch,
    label: extra.label,
    payload,
  }));
  await getRepo().saveOptions(options);
  return options;
}

/** More back ideas: "more like this" for one back, or fresh ones (optionally one template). */
export async function remixBacks(user: User, projectId: string, opts: { parentId?: string | null; template?: string; count?: number }): Promise<BackOption[]> {
  const repo = getRepo();
  const project = await getShirtProject(projectId);
  const existing = (await repo.listOptions(projectId)).filter((o) => o.kind === BACK) as BackOption[];
  const exclude = new Set(existing.map((o) => backKey(o.payload)));
  const rand = seeded(Date.now() ^ (existing.length * 7919));
  const count = Math.min(Math.max(opts.count ?? 6, 1), 12);
  let designs: BackDesign[];
  if (opts.parentId) {
    const parent = existing.find((o) => o.id === opts.parentId);
    if (!parent) throw new HttpError(404, 'That back is gone.');
    designs = similarBacks(parent.payload, { count, exclude, rand });
  } else {
    designs = freshBacks({ occasions: occasionsOf(project), facts: factsOf(project), count, exclude, rand, template: opts.template });
  }
  if (!designs.length) throw new HttpError(422, 'That’s every idea I have for now. Try changing the details or a color.');
  return addBackOptions(projectId, user.id, 'remix', designs, { parentId: opts.parentId ?? null });
}
