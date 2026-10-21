// Changing a back: direct edits (size, colors, layout) and plain-English tweaks.
import { heuristicBackTweak, BACK_TEMPLATE_IDS } from '@/lib/design/back/tweak';
import { backTemplate } from '@/lib/design/back/templates';
import type { BackDesign } from '@/lib/design/back/types';
import { PAIRINGS } from '@/lib/design/pairings';
import { PALETTES } from '@/lib/design/palettes';
import type { User } from '@/lib/engine/types';
import { HttpError } from './auth';
import { oneLine } from './plain';
import { addBackOptions, getBackOption } from './studio';

/** Keeps only fields that make sense; null for pairing/palette means "match the front". */
export function cleanBackPatch(base: BackDesign, patch: Partial<Record<keyof BackDesign, unknown>>): BackDesign {
  const d: BackDesign = { ...base };
  if (typeof patch.template === 'string' && BACK_TEMPLATE_IDS.has(patch.template as BackDesign['template']) && patch.template !== d.template) {
    const t = backTemplate(patch.template);
    d.template = t.id;
    d.variant = t.variants[0].id;
    d.size = t.sizes[0];
  }
  const t = backTemplate(d.template);
  if (typeof patch.variant === 'string' && t.variants.some((v) => v.id === patch.variant)) d.variant = patch.variant;
  if ((patch.size === 'full' || patch.size === 'neck') && t.sizes.includes(patch.size)) d.size = patch.size;
  if (patch.palette === null) d.palette = undefined;
  else if (typeof patch.palette === 'string' && PALETTES.some((p) => p.id === patch.palette)) d.palette = patch.palette;
  if (patch.pairing === null) d.pairing = undefined;
  else if (typeof patch.pairing === 'string' && PAIRINGS.some((p) => p.id === patch.pairing)) d.pairing = patch.pairing;
  return d;
}

export async function editBack(user: User, projectId: string, optionId: string, patch: Partial<Record<keyof BackDesign, unknown>>) {
  const option = await getBackOption(projectId, optionId);
  const design = cleanBackPatch(option.payload, patch ?? {});
  const [created] = await addBackOptions(projectId, user.id, 'edit', [design], { parentId: optionId });
  return { option: created };
}

export async function tweakBack(user: User, projectId: string, optionId: string, request: string) {
  const text = String(request ?? '').trim().slice(0, 400);
  if (!text) throw new HttpError(400, 'Tell me what to change.');
  const option = await getBackOption(projectId, optionId);
  const result = heuristicBackTweak(option.payload, text);
  if (!result.changes.length) {
    throw new HttpError(422, 'I didn’t quite catch that. Try “smaller”, “in navy and gold”, “the receipt one” or “match the front”.');
  }
  const [created] = await addBackOptions(projectId, user.id, 'tweak', [result.design], { parentId: optionId, label: oneLine(text, 80) });
  return { option: created, summary: result.changes.join(', ') };
}
