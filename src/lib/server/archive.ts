// Putting things away and getting them back. A project can be archived (off the
// home screen), restored, renamed, or, once archived, deleted for good. A single
// design can be archived for everyone and restored later. Nothing archived loses
// its hearts or approvals; only "delete for good" removes anything.
import type { OptionRecord, User } from '@/lib/engine/types';
import { BACK, type ShirtSnapshot } from '@/lib/kinds/shirt';
import { record } from './activity';
import { HttpError } from './auth';
import { revokeProjectShares } from './printers';
import { getRepo } from './repo';
import { canManage, getShirtProject, type ShirtProject } from './studio';

const now = () => new Date().toISOString();

function mustManage(user: User, project: ShirtProject, what: string) {
  if (!canManage(user, project)) throw new HttpError(403, `Only the person who started it can ${what} it.`);
}

export async function archiveProject(user: User, id: string): Promise<ShirtProject> {
  const project = await getShirtProject(id);
  mustManage(user, project, 'archive');
  if (!project.archived) {
    project.archived = true;
    project.archivedAt = now();
    project.archivedBy = user.id;
    project.updatedAt = project.archivedAt;
    await getRepo().saveProject(project);
    // Put away means put away: printer links to its files stop too (restoring doesn't bring them back; make a new one).
    await revokeProjectShares(project.id);
    await record(user, 'archived', { project });
  }
  return project;
}

/** Back on the home screen, exactly as it was. */
export async function restoreProject(user: User, id: string): Promise<ShirtProject> {
  const project = await getShirtProject(id);
  mustManage(user, project, 'restore');
  if (project.archived) {
    delete project.archived;
    delete project.archivedAt;
    delete project.archivedBy;
    project.updatedAt = now();
    await getRepo().saveProject(project);
    await record(user, 'restored', { project });
  }
  return project;
}

/** Either of you can rename a project; it's just a label. */
export async function renameProject(user: User, id: string, title: unknown): Promise<ShirtProject> {
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (!clean) throw new HttpError(400, 'Give it a name first.');
  const project = await getShirtProject(id);
  if (project.title === clean) return project;
  const before = project.title;
  project.title = clean;
  project.updatedAt = now();
  await getRepo().saveProject(project);
  await record(user, 'renamed', { project, detail: `from “${before}”` });
  return project;
}

/** Stored files a design draws on: painted artwork, and the print-size copy made at approval. */
function artKeys(o: OptionRecord): string[] {
  const art = (o.payload as { art?: { kind?: string; assetKey?: unknown } } | null)?.art;
  if (!art || (art.kind !== 'image' && art.kind !== 'svg') || typeof art.assetKey !== 'string') return [];
  return [art.assetKey, art.assetKey.replace(/\.(png|jpe?g|webp)$/i, '') + '@print.png'];
}

/**
 * Gone for good: the project, its designs, hearts and approvals, its artwork and
 * every print package it made. Only from the archive, never an approved project,
 * and only with its name typed out.
 */
export async function deleteProject(user: User, id: string, confirm: unknown): Promise<void> {
  const repo = getRepo();
  const project = await getShirtProject(id);
  mustManage(user, project, 'delete');
  if (project.keep) throw new HttpError(409, 'This one’s kept for good. Archive it instead.');
  if (!project.archived) throw new HttpError(409, 'Archive it first. Projects are only deleted from the archive.');
  if (project.status === 'approved') {
    throw new HttpError(409, 'Approved projects keep their print files, so they can’t be deleted. Reopen it first if you really want it gone.');
  }
  if (typeof confirm !== 'string' || confirm.trim().toLowerCase() !== project.title.trim().toLowerCase()) {
    throw new HttpError(400, 'Type the project’s name exactly to delete it.');
  }
  const designs = (await repo.listOptions(id)).length;
  await eraseProjects([id]);
  await record(user, 'deleted', { project, detail: `${designs} design${designs === 1 ? '' : 's'}` });
}

/**
 * Removes projects and everything recorded against them, with their artwork
 * and print files. No questions asked: callers check first (deleteProject
 * above, or an account whose household is left empty).
 */
export async function eraseProjects(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const repo = getRepo();
  const going = new Set(ids);
  const projects = await repo.listProjects();
  const [options, decisions, others] = await Promise.all([
    Promise.all(ids.map((id) => repo.listOptions(id))).then((l) => l.flat()),
    Promise.all(ids.map((id) => repo.listDecisions(id))).then((l) => l.flat()),
    Promise.all(projects.filter((p) => !going.has(p.id)).map((p) => repo.listOptions(p.id))).then((l) => l.flat()),
  ]);
  // Artwork another project also uses stays.
  const shared = new Set(others.flatMap(artKeys));
  const keys = [...new Set([...options.flatMap(artKeys).filter((k) => !shared.has(k)), ...decisions.flatMap((d) => (d.files ?? []).map((f) => f.key))])];
  for (const id of ids) await repo.deleteProject(id);
  try {
    await repo.deleteAssets(keys);
  } catch (e) {
    // The records are gone either way; a stray file only costs storage.
    console.error('Deleted the project, but some of its files are still in storage', e);
  }
}

/** Puts one design (front or back) away for everyone, or brings it back. */
export async function setDesignArchived(user: User, projectId: string, optionId: unknown, archived: boolean): Promise<OptionRecord> {
  if (typeof optionId !== 'string' || !optionId) throw new HttpError(400, 'Which design?');
  const repo = getRepo();
  const project = await getShirtProject(projectId);
  const option = await repo.getOption(optionId);
  if (!option || option.projectId !== projectId) throw new HttpError(404, 'That design is gone.');
  if (archived && project.status === 'approved' && project.decisionId) {
    const decision = await repo.getDecision(project.decisionId);
    const snapshot = decision?.snapshot as ShirtSnapshot | undefined;
    if (decision && (decision.optionId === option.id || snapshot?.back?.optionId === option.id)) {
      throw new HttpError(409, 'That’s part of the approved shirt. Reopen the project first if you want to put it away.');
    }
  }
  const changed = archived !== !!option.archived;
  if (archived && !option.archived) option.archived = { at: now(), by: user.id };
  if (!archived) delete option.archived;
  await repo.saveOptions([option]);
  if (changed) await record(user, archived ? 'design-archived' : 'design-restored', { project, optionId: option.id, detail: option.kind === BACK ? 'a back' : 'a front' });
  return option;
}
