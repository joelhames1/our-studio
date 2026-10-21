// Approving a design, building its print package, and changing your mind.
import { backWidthIn, resolveBack } from '@/lib/design/back/render';
import { backTemplate } from '@/lib/design/back/templates';
import { copyFor } from '@/lib/design/render';
import { GARMENT_STYLES, PRINT_PRESETS } from '@/lib/design/garments';
import { GARMENT_COLORS } from '@/lib/design/palettes';
import type { GarmentStyle } from '@/lib/design/types';
import type { Decision, User } from '@/lib/engine/types';
import { SIZES, type BackSnapshot, type ShirtSnapshot, type SizeLine } from '@/lib/kinds/shirt';
import { record } from './activity';
import { ADMIN, HttpError } from './auth';
import { nameOf } from './people';
import { buildShirtPackage } from './export/package';
import { getRepo } from './repo';
import { approverOf, canApprove, factsOf, getBackOption, getShirtProject, newId, type ShirtOption } from './studio';

export interface ApproveInput {
  optionId: string;
  garment: GarmentStyle;
  color: string;
  preset: string;
  sizes: SizeLine[];
  notes?: string;
  /** The chosen back, or null/missing for nothing on the back. */
  backOptionId?: string | null;
}

/** Names for a back that prints each wearer's name: the "who" on each size line, else everyone in the details. */
export function wearerNames(sizes: SizeLine[], people: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const from = sizes.map((s) => s.who.trim()).filter(Boolean);
  for (const n of from.length ? from : people) {
    const key = n.toLowerCase();
    if (n.trim() && !seen.has(key)) {
      seen.add(key);
      out.push(n.trim());
    }
  }
  return out.slice(0, 20);
}

const MAX_SIZE_LINES = 50;

export async function approve(user: User, projectId: string, input: ApproveInput): Promise<Decision<ShirtSnapshot>> {
  const repo = getRepo();
  const project = await getShirtProject(projectId);
  if (!canApprove(user, project)) throw new HttpError(403, `${await nameOf(approverOf(project))} makes the final call on this one.`);
  if (project.status === 'approved') throw new HttpError(409, 'Already approved. Reopen it first to pick a different one.');
  const option = (await repo.getOption(input.optionId)) as ShirtOption | null;
  if (!option || option.projectId !== projectId || option.kind !== 'shirt') throw new HttpError(404, 'That design is gone.');
  if (option.archived) throw new HttpError(409, 'That design is archived. Restore it first.');
  if (!GARMENT_STYLES.some((g) => g.id === input.garment)) throw new HttpError(400, 'Pick a shirt style.');
  if (!GARMENT_COLORS.some((c) => c.id === input.color)) throw new HttpError(400, 'Pick a shirt color.');
  if (!PRINT_PRESETS.some((p) => p.id === input.preset)) throw new HttpError(400, 'Pick a print size.');
  if (Array.isArray(input.sizes) && input.sizes.length > MAX_SIZE_LINES) throw new HttpError(400, `That's a lot of shirts! Up to ${MAX_SIZE_LINES} lines per order.`);
  const sizes = (Array.isArray(input.sizes) ? input.sizes : [])
    .map((line) => {
      const s = (line && typeof line === 'object' ? line : {}) as Partial<Record<keyof SizeLine, unknown>>;
      return {
        who: typeof s.who === 'string' ? s.who.slice(0, 40) : '',
        size: SIZES.includes(s.size as SizeLine['size']) ? (s.size as SizeLine['size']) : 'M',
        qty: Math.min(Math.max(Math.round(Number(s.qty) || 0), 0), 99),
      };
    })
    .filter((s) => s.qty > 0);
  if (!sizes.length) throw new HttpError(400, 'Add at least one shirt.');

  let back: BackSnapshot | null = null;
  if (typeof input.backOptionId === 'string' && input.backOptionId) {
    const b = await getBackOption(projectId, input.backOptionId);
    if (b.archived) throw new HttpError(409, 'That back is archived. Restore it first.');
    const facts = factsOf(project);
    back = {
      optionId: b.id,
      design: resolveBack(b.payload, option.payload),
      facts,
      widthIn: backWidthIn(b.payload.size, input.garment),
      names: backTemplate(b.payload.template).personal ? wearerNames(sizes, facts.people) : [],
    };
  }

  const decision: Decision<ShirtSnapshot> = {
    id: newId(),
    projectId,
    optionId: option.id,
    approvedBy: user.id,
    approvedAt: new Date().toISOString(),
    status: 'building',
    snapshot: {
      design: option.payload,
      copy: copyFor(option.payload, { copy: project.brief.copy }),
      garment: input.garment,
      color: input.color,
      preset: input.preset,
      sizes,
      notes: typeof input.notes === 'string' ? input.notes.slice(0, 1000) : '',
      back,
    },
  };
  await repo.saveDecision(decision);
  project.status = 'approved';
  project.decisionId = decision.id;
  project.updatedAt = decision.approvedAt;
  await repo.saveProject(project);
  const shirts = sizes.reduce((n, s) => n + s.qty, 0);
  await record(user, 'approved', { project, optionId: option.id, detail: `${shirts} shirt${shirts === 1 ? '' : 's'}${back ? ', front and back' : ''}` });
  return decision;
}

const STALE_MS = 5 * 60 * 1000;

/** Builds the print package. Safe to call twice; a fresh build in progress is left alone. */
export async function buildPackage(decisionId: string): Promise<Decision<ShirtSnapshot>> {
  const repo = getRepo();
  const decision = (await repo.getDecision(decisionId)) as (Decision<ShirtSnapshot> & { buildStartedAt?: string }) | null;
  if (!decision) throw new HttpError(404, 'That approval is gone.');
  if (decision.status === 'ready' || decision.status === 'reopened') return decision;
  if (decision.status === 'building' && decision.buildStartedAt && Date.now() - Date.parse(decision.buildStartedAt) < STALE_MS) return decision;
  decision.status = 'building';
  decision.buildStartedAt = new Date().toISOString();
  decision.error = undefined;
  await repo.saveDecision(decision);
  const project = await getShirtProject(decision.projectId);
  try {
    decision.files = await buildShirtPackage(decision, project.title);
    decision.status = 'ready';
  } catch (e) {
    // The details go to the server log; the phone gets something readable.
    console.error('Package build failed', e);
    decision.status = 'failed';
    decision.error = `The print files didn’t build. Try again in a minute; if it keeps happening, ${ADMIN.name} can check the logs.`;
  }
  await repo.saveDecision(decision);
  return decision;
}

/** "Changed my mind": only whoever has the final say can undo it. */
export async function reopen(user: User, projectId: string): Promise<void> {
  const repo = getRepo();
  const project = await getShirtProject(projectId);
  if (!canApprove(user, project)) throw new HttpError(403, `Only ${await nameOf(approverOf(project))} can reopen this one.`);
  if (project.status !== 'approved') throw new HttpError(409, 'This one isn’t approved yet.');
  if (project.decisionId) {
    const d = await repo.getDecision(project.decisionId);
    if (d) await repo.saveDecision({ ...d, status: 'reopened' });
  }
  project.status = 'exploring';
  project.decisionId = null;
  project.updatedAt = new Date().toISOString();
  await repo.saveProject(project);
  await record(user, 'reopened', { project });
}
