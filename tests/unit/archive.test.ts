// Putting things away: projects (archive, restore, rename, delete for good) and
// single designs (archived for both of you, back with their hearts on restore).
import { describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { preset } from '@/lib/design/occasions';
import type { Decision } from '@/lib/engine/types';
import { archiveProject, deleteProject, renameProject, restoreProject, setDesignArchived } from '@/lib/server/archive';
import { USERS } from '@/lib/server/auth';
import { approve, reopen } from '@/lib/server/decisions';
import { archivedCount, archivedSummaries, projectSummaries } from '@/lib/server/overview';
import { createProject } from '@/lib/server/projects';
import { ensureSeed, projectState, react, SEED_PROJECT_ID } from '@/lib/server/studio';

const { joel, erin } = USERS;
/** Someone in the household who didn't start the project and doesn't own the household. */
const bystander = { ...joel, id: 'sam', name: 'Sam', admin: false, role: 'member' as const, roles: { first: 'member' as const } };

async function birthday(by = joel, title = 'Maya’s 40th') {
  const p = preset('birthday');
  return createProject(by, { occasion: 'birthday', basics: { ...p.example, title }, copy: p.copyIdeas(p.example)[0] });
}

const order = { garment: 'tee' as const, color: 'navy', preset: 'standard', sizes: [{ who: 'Maya', size: 'M' as const, qty: 1 }] };

describe('archiving a project', () => {
  it('records when and by whom, takes it off the home screen, and restores it as it was', async () => {
    tempRepo();
    const project = await birthday(erin);
    const state = await projectState(project.id, erin);
    await react(erin, project.id, state.options[0].id, 'love');

    await expect(archiveProject(bystander, project.id)).rejects.toThrow(/started it/);
    const archived = await archiveProject(erin, project.id);
    expect(archived).toMatchObject({ archived: true, archivedBy: 'erin' });
    expect(Date.parse(archived.archivedAt!)).toBeGreaterThan(Date.now() - 5000);
    expect((await projectSummaries(erin)).map((s) => s.project.id)).not.toContain(project.id);
    expect(await archivedCount(erin)).toBe(1);

    const [row] = await archivedSummaries(erin);
    expect(row).toMatchObject({ startedBy: 'you', archivedBy: 'you', canRestore: true, keep: null, hearts: 1, total: state.options.length });
    expect(row.pick).not.toBeNull();
    // Joel sees the same row from his side, and as admin can manage it too.
    expect((await archivedSummaries(joel))[0]).toMatchObject({ startedBy: 'Erin', archivedBy: 'Erin', canRestore: true });

    const back = await restoreProject(erin, project.id);
    expect(back.archived).toBeUndefined();
    expect(back.archivedAt).toBeUndefined();
    const home = (await projectSummaries(erin)).find((s) => s.project.id === project.id)!;
    expect(home.hearts).toBe(1);
    expect(await archivedCount(erin)).toBe(0);
  });

  it('archives approved projects too, and keeps them from being deleted', async () => {
    tempRepo();
    const project = await birthday();
    const state = await projectState(project.id, joel);
    await approve(joel, project.id, { ...order, optionId: state.options[0].id });
    await archiveProject(joel, project.id);
    expect((await archivedSummaries(joel))[0].keep).toMatch(/Approved/);
    await expect(deleteProject(joel, project.id, project.title)).rejects.toThrow(/Approved projects keep their print files/);
  });

  it('can be renamed by either of you, so same-named projects can be told apart', async () => {
    tempRepo();
    const project = await birthday();
    expect((await renameProject(erin, project.id, '  Maya’s 40th   (test) ')).title).toBe('Maya’s 40th (test)');
    await expect(renameProject(erin, project.id, '   ')).rejects.toThrow(/name/);
    expect((await renameProject(erin, project.id, 'x'.repeat(200))).title).toHaveLength(60);
  });
});

describe('deleting a project for good', () => {
  it('only from the archive, by whoever started it, with its name typed out', async () => {
    tempRepo();
    const project = await birthday(erin);
    await expect(deleteProject(erin, project.id, project.title)).rejects.toThrow(/Archive it first/);
    await archiveProject(erin, project.id);
    await expect(deleteProject(bystander, project.id, project.title)).rejects.toThrow(/started it/);
    await expect(deleteProject(erin, project.id, 'Maya')).rejects.toThrow(/Type the project’s name/);
    await deleteProject(erin, project.id, ` ${project.title.toUpperCase()} `);
    await expect(projectState(project.id, erin)).rejects.toThrow(/does not exist/);
  });

  it('never one that’s kept for good (the first project)', async () => {
    tempRepo();
    await ensureSeed();
    await archiveProject(joel, SEED_PROJECT_ID);
    await expect(deleteProject(joel, SEED_PROJECT_ID, 'Sample Shirt')).rejects.toThrow(/kept for good/);
  });

  it('removes its designs, hearts, approvals and files, but not artwork another project uses', async () => {
    const { repo } = tempRepo();
    const keep = await birthday(joel, 'Keep me');
    const gone = await birthday(joel, 'Throw away');
    const [first, second] = (await projectState(gone.id, joel)).options;
    const keeper = (await projectState(keep.id, joel)).options[0];
    // Painted artwork: one only this project uses, one shared with the project we keep.
    const own = { kind: 'image' as const, assetKey: 'art/own.png', width: 10, height: 10 };
    const shared = { kind: 'image' as const, assetKey: 'art/shared.png', width: 10, height: 10 };
    await repo.saveOptions([
      { ...first, payload: { ...first.payload, art: own } },
      { ...second, payload: { ...second.payload, art: shared } },
      { ...keeper, payload: { ...keeper.payload, art: shared } },
    ]);
    for (const k of ['art/own.png', 'art/own@print.png', 'art/shared.png', 'decisions/d1/print.png']) await repo.putAsset(k, Buffer.from('x'));
    await react(erin, gone.id, first.id, 'love');
    // An approval since reopened, with its print package.
    const d = await approve(joel, gone.id, { ...order, optionId: second.id });
    await repo.saveDecision({ ...(d as Decision), files: [{ name: 'print.png', key: 'decisions/d1/print.png', bytes: 1, contentType: 'image/png', label: 'Print file' }] });
    await reopen(joel, gone.id);

    await archiveProject(joel, gone.id);
    await deleteProject(joel, gone.id, 'Throw away');
    expect(await repo.getProject(gone.id)).toBeNull();
    expect(await repo.listOptions(gone.id)).toEqual([]);
    expect(await repo.listReactions(gone.id)).toEqual([]);
    expect(await repo.listDecisions(gone.id)).toEqual([]);
    expect(await repo.getAsset('art/own.png')).toBeNull();
    expect(await repo.getAsset('art/own@print.png')).toBeNull();
    expect(await repo.getAsset('decisions/d1/print.png')).toBeNull();
    expect(await repo.getAsset('art/shared.png')).not.toBeNull();
    expect(await repo.getProject(keep.id)).not.toBeNull();
  });
});

describe('archiving a single design', () => {
  it('takes it out for both of you, and restore brings it back with its hearts', async () => {
    tempRepo();
    const project = await birthday();
    const start = await projectState(project.id, joel);
    const target = start.options[1];
    await react(joel, project.id, target.id, 'love');
    await react(erin, project.id, target.id, 'love');
    const before = (await projectSummaries(joel)).find((s) => s.project.id === project.id)!;
    expect(before.matches).toBe(1);

    const put = await setDesignArchived(erin, project.id, target.id, true);
    expect(put.archived).toMatchObject({ by: 'erin' });
    for (const who of [joel, erin]) {
      const s = await projectState(project.id, who);
      expect(s.options.map((o) => o.id)).not.toContain(target.id);
      expect(s.archived.map((o) => o.id)).toEqual([target.id]);
    }
    const during = (await projectSummaries(joel)).find((s) => s.project.id === project.id)!;
    expect(during).toMatchObject({ matches: 0, total: before.total - 1 });
    await expect(approve(joel, project.id, { ...order, optionId: target.id })).rejects.toThrow(/archived/);

    await setDesignArchived(joel, project.id, target.id, false);
    const after = await projectState(project.id, joel);
    expect(after.options.map((o) => o.id)).toContain(target.id);
    expect(after.archived).toEqual([]);
    expect((await projectSummaries(joel)).find((s) => s.project.id === project.id)!.matches).toBe(1);
  });

  it('works for backs, and never on the approved shirt', async () => {
    tempRepo();
    const project = await birthday();
    const s = await projectState(project.id, joel);
    await setDesignArchived(joel, project.id, s.backs[0].id, true);
    const afterBack = await projectState(project.id, joel);
    expect(afterBack.archivedBacks.map((b) => b.id)).toEqual([s.backs[0].id]);
    expect(afterBack.backs).toHaveLength(s.backs.length - 1);
    await expect(approve(joel, project.id, { ...order, optionId: s.options[0].id, backOptionId: s.backs[0].id })).rejects.toThrow(/back is archived/);

    await approve(joel, project.id, { ...order, optionId: s.options[0].id, backOptionId: s.backs[1].id });
    await expect(setDesignArchived(joel, project.id, s.options[0].id, true)).rejects.toThrow(/approved shirt/);
    await expect(setDesignArchived(joel, project.id, s.backs[1].id, true)).rejects.toThrow(/approved shirt/);
    await setDesignArchived(joel, project.id, s.options[2].id, true);
    await expect(setDesignArchived(joel, project.id, 'nope', true)).rejects.toThrow(/gone/);
  });
});

describe('the shirt each project is shown on', () => {
  it('is a white tee until it’s approved, then the shirt it was ordered on', async () => {
    tempRepo();
    const project = await birthday();
    const state = await projectState(project.id, joel);
    const home = async () => (await projectSummaries(joel)).find((s) => s.project.id === project.id)!.shirt;
    expect(await home()).toEqual({ style: 'tee', color: 'white' });

    await approve(joel, project.id, { ...order, garment: 'hoodie', color: 'navy', optionId: state.options[0].id });
    expect(await home()).toEqual({ style: 'hoodie', color: 'navy' });

    // Reopened, it's back to being decided.
    await reopen(joel, project.id);
    expect(await home()).toEqual({ style: 'tee', color: 'white' });

    // Approved again and put away, the archive shows the shirt too.
    await approve(joel, project.id, { ...order, garment: 'longsleeve', color: 'natural', optionId: state.options[1].id });
    await archiveProject(joel, project.id);
    expect((await archivedSummaries(joel))[0].shirt).toEqual({ style: 'longsleeve', color: 'natural' });
  });
});
