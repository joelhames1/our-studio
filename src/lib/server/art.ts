// AI artwork: Claude art-directs, the image service paints, Claude checks the
// result for stray lettering, and each painting becomes a new design option.
import sharp from 'sharp';
import { palette as getPalette } from '@/lib/design/palettes';
import { motifsFor } from '@/lib/design/occasions';
import type { ArtRef, LayoutId, MotifId, ShirtDesign } from '@/lib/design/types';
import { vibe as getVibe, vibesFor, VIBES } from '@/lib/design/vibes';
import type { User } from '@/lib/engine/types';
import { sendAlert } from './alerts';
import { ADMIN, HttpError, whoFixes } from './auth';
import { config } from './config';
import { checkArt, writeArtConcepts, type ArtConcept } from './llm/tasks';
import { getImageProvider } from './providers';
import { FIRST_HOUSEHOLD } from './people';
import { getRepo } from './repo';
import { imageTrouble } from './health';
import { reserveSpend } from './spend';
import { addOptions, artIdeasOf, contextOf, getShirtProject, householdOf, newId, occasionsOf, type ShirtOption } from './studio';

export function artAvailable(): boolean {
  return config.imageProvider !== 'mock' || !config.isProduction;
}

const ART_LAYOUTS: LayoutId[] = ['stack', 'badge', 'arch', 'minimal', 'poster'];

/** Without Claude, build prompts from the vibe's style notes and the occasion's subjects. */
function templateConcepts(count: number, styles: { name: string; artStyle: string; palettes: string[] }[], idea: string, ideas: string[]): ArtConcept[] {
  const subjects = idea.trim() ? [idea.trim()] : ideas;
  return Array.from({ length: count }, (_, i) => {
    const s = styles[i % styles.length];
    const paletteId = s.palettes[i % s.palettes.length];
    const p = getPalette(paletteId).light;
    const subject = subjects[i % subjects.length];
    return {
      subject,
      prompt: `${subject}. Style: ${s.artStyle}. Use only these colors: ${[p.text, p.accent, p.accent2, ...p.sun.slice(0, 2), ...p.water.slice(0, 1)].join(', ')}.`,
      palette: paletteId,
      layout: ART_LAYOUTS[i % ART_LAYOUTS.length] as ArtConcept['layout'],
    };
  });
}

/** Where a project's artwork is kept: a folder per household, which is how the file route knows who may open it. */
async function artFolder(projectId: string): Promise<string> {
  const project = await getRepo().getProject(projectId);
  return `art/${project ? householdOf(project) : FIRST_HOUSEHOLD}`;
}

async function storePng(png: Buffer, folder: string): Promise<{ key: string; width: number; height: number }> {
  // Trim empty transparent margins so the art sits tight in the layout.
  let img = sharp(png).ensureAlpha();
  try {
    img = sharp(await img.trim({ threshold: 2 }).png().toBuffer());
  } catch {
    // Nothing to trim.
  }
  const buf = await img.png().toBuffer();
  const meta = await sharp(buf).metadata();
  const key = `${folder}/${newId()}.png`;
  await getRepo().putAsset(key, buf, 'image/png');
  return { key, width: meta.width ?? 1024, height: meta.height ?? 1024 };
}

/** Paints one concept and returns the artwork, or null if it failed the check. */
async function paint(concept: ArtConcept, styles: string[], projectId: string, motifs?: MotifId[]): Promise<ArtRef | null> {
  const provider = getImageProvider();
  const p = getPalette(concept.palette).light;
  const settle = await reserveSpend(provider.id, provider.model, provider.estimateUsd, `artwork: ${concept.subject}`, projectId);
  let result: Awaited<ReturnType<typeof provider.generate>>;
  try {
    result = await provider.generate({ prompt: concept.prompt, subject: concept.subject, styles, colors: [p.text, p.accent, p.accent2, ...p.sun, ...p.water], motifs });
  } catch (e) {
    // A failed job may still have been billed; keep the hold rather than guess.
    await settle(provider.estimateUsd, imageTrouble(e));
    throw e;
  }
  await settle(result.usd);
  if (result.type === 'svg') {
    const key = `${await artFolder(projectId)}/${newId()}.svg`;
    await getRepo().putAsset(key, result.data, 'image/svg+xml');
    return { kind: 'svg', assetKey: key, prompt: concept.subject };
  }
  if (config.anthropicKey && provider.id !== 'mock') {
    try {
      const preview = await sharp(result.data).resize({ width: 768, withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer();
      const verdict = await checkArt(preview);
      if (verdict.hasLettering || !verdict.printable) {
        console.warn('Artwork rejected:', verdict.note);
        return null;
      }
    } catch (e) {
      console.error('Art check failed; keeping the artwork', e);
    }
  }
  const stored = await storePng(result.data, await artFolder(projectId));
  return { kind: 'image', assetKey: stored.key, width: stored.width, height: stored.height, prompt: concept.subject, provider: provider.id };
}

export async function generateArtOptions(user: User, projectId: string, opts: { idea?: string; basedOn?: string | null; count?: number }): Promise<ShirtOption[]> {
  if (!artAvailable()) throw new HttpError(400, `AI artwork isn’t switched on yet. ${whoFixes(user)} can add an image key in Setup.`);
  const project = await getShirtProject(projectId);
  const provider = getImageProvider();
  const count = Math.min(Math.max(Math.floor(Number(opts.count) || 3), 1), 4);

  const found = typeof opts.basedOn === 'string' ? ((await getRepo().getOption(opts.basedOn)) as ShirtOption | null) : null;
  const base = found?.kind === 'shirt' && found.projectId === projectId ? found : null;
  const idea = typeof opts.idea === 'string' ? opts.idea.slice(0, 300) : '';
  const fallback = project.brief.artVibes?.length ? project.brief.artVibes : vibesFor(occasionsOf(project)).filter((v) => !v.layouts.includes('ticket')).slice(0, 4).map((v) => v.id);
  const chosen = (project.brief.vibes.length ? project.brief.vibes : fallback)
    .map((v) => getVibe(v))
    .filter((v): v is (typeof VIBES)[number] => !!v);
  const ideas = artIdeasOf(project);
  const styles = chosen.map((v) => v.artStyle);

  let concepts: ArtConcept[];
  if (config.anthropicKey) {
    try {
      concepts = await writeArtConcepts(count, styles, idea, project.brief.copy, contextOf(project), ideas);
    } catch (e) {
      console.error('Art direction failed, using templates', e);
      concepts = templateConcepts(count, chosen, idea, ideas);
    }
  } else concepts = templateConcepts(count, chosen, idea, ideas);

  const motifs = motifsFor(occasionsOf(project));
  const settled = await Promise.allSettled(concepts.map((c) => paint(c, styles, projectId, motifs).then((art) => ({ c, art }))));
  const painted = settled.flatMap((s) => (s.status === 'fulfilled' && s.value.art ? [s.value as { c: ArtConcept; art: ArtRef }] : []));
  const failures = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
  if (!painted.length) {
    if (failures.length) console.error(failures.map((f) => f.reason));
    // Our own messages (like an empty budget) are fine to show; provider errors stay in the logs.
    const ours = failures.find((f) => f.reason instanceof HttpError)?.reason as HttpError | undefined;
    if (ours) throw ours;
    if (failures.length) {
      const why = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason);
      await sendAlert('ai', [`The artwork service (${getImageProvider().label}) failed every painting in a batch.`, `Why: ${why}`, 'Setup → AI artwork → Test it shows whether it’s back.']);
    }
    throw new HttpError(502, failures.length ? `The artist had a problem. Try again in a minute; if it keeps happening, ${user.admin ? 'check Setup' : `${ADMIN.name} can check Setup`}.` : 'Those paintings didn’t pass the check (stray lettering). Try again?');
  }

  const designs: ShirtDesign[] = painted.map(({ c, art }, i) => {
    if (base) return { ...base.payload, art, layout: base.payload.layout === 'ticket' || base.payload.layout === 'bigtype' ? 'stack' : base.payload.layout };
    const v = chosen[i % chosen.length];
    return {
      layout: c.layout,
      pairing: v?.pairings[i % v.pairings.length] ?? 'bebas-pacifico',
      palette: c.palette,
      art,
      ticket: project.brief.ticket,
    };
  });
  return addOptions(projectId, user.id, 'ai', designs, { parentId: base?.id ?? null, label: idea.slice(0, 80) || undefined });
}

/** Paints a single subject for a tweak ("add a manta ray"). */
export async function paintForTweak(projectId: string, subject: string, paletteId: string, styles: string[], motifs?: MotifId[]): Promise<ArtRef | null> {
  if (!artAvailable()) return null;
  const p = getPalette(paletteId).light;
  return paint(
    {
      subject,
      prompt: `${subject}. Style: ${styles[0] ?? 'flat bold screen-print illustration'}. Use only these colors: ${[p.text, p.accent, p.accent2, ...p.sun.slice(0, 2)].join(', ')}.`,
      palette: paletteId,
      layout: 'stack',
    },
    styles,
    projectId,
    motifs,
  );
}
