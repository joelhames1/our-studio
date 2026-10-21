import { parseColors } from '@/lib/design/colors';
import { heuristicTweak, type TweakResult } from '@/lib/design/tweak';
import { PAIRINGS } from '@/lib/design/pairings';
import { EMPHASES, isLayout, safeCopy, safeScale } from '@/lib/design/safe';
import { garmentColor, PALETTES } from '@/lib/design/palettes';
import type { Emphasis, GarmentColor, ShirtDesign } from '@/lib/design/types';
import type { User } from '@/lib/engine/types';
import { HttpError } from './auth';
import { getRepo } from './repo';
import { addArtRequest } from '@/lib/design/examples';
import { motifsFor } from '@/lib/design/occasions';
import { oneLine } from './plain';
import { addOptions, contextOf, getShirtProject, occasionsOf, type ShirtOption } from './studio';

/** Hook for a smarter interpreter (Claude); falls back to keywords. */
export type TweakInterpreter = (
  base: ShirtDesign,
  request: string,
  context: { copy: ShirtDesign['copyOverride']; projectId?: string; about: string; shirt?: GarmentColor; user?: User },
) => Promise<TweakResult | null>;

let smart: TweakInterpreter | null = null;
export function setTweakInterpreter(fn: TweakInterpreter | null) {
  smart = fn;
}

/** `shirt`: the shirt color they're looking at, so "darker" means darker on that. */
export async function tweakOption(user: User, projectId: string, optionId: unknown, request: unknown, shirt?: unknown) {
  const text = typeof request === 'string' ? request.trim().slice(0, 400) : '';
  if (!text) throw new HttpError(400, 'Tell me what to change.');
  const project = await getShirtProject(projectId);
  const option = typeof optionId === 'string' ? ((await getRepo().getOption(optionId)) as ShirtOption | null) : null;
  if (!option || option.projectId !== projectId || option.kind !== 'shirt') throw new HttpError(404, 'That design is gone.');

  const copy = option.payload.copyOverride ?? project.brief.copy;
  let result: TweakResult | null = null;
  if (smart) {
    try {
      result = await smart(option.payload, text, { copy, projectId, about: contextOf(project), shirt: typeof shirt === 'string' ? garmentColor(shirt) : undefined, user });
    } catch (e) {
      // Our own errors are worth showing, except an empty budget: keywords still work then.
      if (e instanceof HttpError && e.status !== 402) throw e;
      console.error('Smart tweak failed, using keywords instead', e);
    }
  }
  const occasions = occasionsOf(project);
  if (!result || !result.changes.length) result = heuristicTweak(option.payload, text, motifsFor(occasions), copy);
  if (!result.changes.length) {
    throw new HttpError(422, `I didn’t quite catch that. Try “bigger words”, “coral big words”, “${addArtRequest(occasions).toLowerCase()}” or “simpler”.`);
  }
  const [created] = await addOptions(projectId, user.id, 'tweak', [result.design], { parentId: option.id, label: oneLine(text, 80) });
  return { option: created, summary: result.changes.join(', ') };
}

/** Direct edits (e.g. new words for just this design). Anything unexpected is refused. */
export async function editOption(user: User, projectId: string, optionId: string, patch: unknown) {
  if (typeof optionId !== 'string') throw new HttpError(400, 'Which design?');
  const option = (await getRepo().getOption(optionId)) as ShirtOption | null;
  if (!option || option.projectId !== projectId || option.kind !== 'shirt') throw new HttpError(404, 'That design is gone.');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Nothing to change.');
  const p = patch as Record<string, unknown>;
  const has = (k: string) => Object.hasOwn(p, k);
  const bad = (what: string) => new HttpError(400, `That ${what} isn’t one I know.`);
  const clean: Partial<ShirtDesign> = {};
  if (has('copyOverride')) {
    if (p.copyOverride === null) clean.copyOverride = undefined;
    else {
      const c = safeCopy(p.copyOverride);
      if (!c) throw bad('wording');
      clean.copyOverride = c;
    }
  }
  if (has('colors')) {
    // The whole set, as the Colors panel shows it; null clears them all.
    if (p.colors === null) clean.colors = undefined;
    else {
      const c = parseColors(p.colors);
      if (!c) throw bad('color');
      clean.colors = Object.keys(c).length ? c : undefined;
    }
  }
  if (has('palette')) {
    if (!PALETTES.some((x) => x.id === p.palette)) throw bad('color scheme');
    clean.palette = p.palette as string;
  }
  if (has('pairing')) {
    if (!PAIRINGS.some((x) => x.id === p.pairing)) throw bad('font pairing');
    clean.pairing = p.pairing as string;
  }
  if (has('layout')) {
    if (!isLayout(p.layout)) throw bad('layout');
    clean.layout = p.layout;
  }
  if (has('emphasis')) {
    if (!EMPHASES.includes(p.emphasis as Emphasis)) throw bad('emphasis');
    clean.emphasis = p.emphasis as Emphasis;
  }
  for (const k of ['shadow', 'outline'] as const) {
    if (!has(k)) continue;
    if (typeof p[k] !== 'boolean') throw bad(k);
    clean[k] = p[k];
  }
  for (const k of ['headlineScale', 'taglineScale', 'artScale'] as const) {
    if (!has(k)) continue;
    if (p[k] === null) clean[k] = undefined;
    else if (typeof p[k] === 'number' && Number.isFinite(p[k])) clean[k] = safeScale(p[k]);
    else throw bad('size');
  }
  if (!Object.keys(clean).length) throw new HttpError(400, 'Nothing to change.');
  const [created] = await addOptions(projectId, user.id, 'edit', [{ ...option.payload, ...clean }], { parentId: optionId });
  return { option: created };
}
