// Plain-English changes to a back ("make it smaller", "the receipt one, in navy").
import { PAIRING_WORDS, PALETTE_WORDS } from '../tweak';
import { BACK_TEMPLATES, backTemplate } from './templates';
import type { BackDesign, BackTemplateId } from './types';

export interface BackTweakResult {
  design: BackDesign;
  changes: string[];
}

const TEMPLATE_WORDS: [RegExp, BackTemplateId][] = [
  [/\b(flights?|route|airports?|map|path)\b/, 'flight-path'],
  [/\b(tour|band|concert|cities)\b/, 'tour-dates'],
  [/\b(numbers|stats|statistics|receipt|facts)\b/, 'numbers'],
  [/\b(timeline|history|years? (list|line))\b/, 'timeline'],
  [/\b(crew|roster|everyone|squad|line.?up)\b/, 'crew'],
  [/\b(jersey|sports?|name and number)\b/, 'jersey'],
  [/\b(est|established|since|class of|vintage)\b/, 'established'],
  [/\b(coordinates|lat(itude)?|gps|compass)\b/, 'coordinates'],
  [/\b(statement|quote|slogan|just words)\b/, 'statement'],
];

export function heuristicBackTweak(base: BackDesign, request: string): BackTweakResult {
  const q = ` ${request.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ')} `;
  const d: BackDesign = { ...base };
  const changes: string[] = [];
  const has = (re: RegExp) => re.test(q);

  // A different template, if one is named and it isn't this one.
  for (const [re, id] of TEMPLATE_WORDS) {
    if (has(re) && id !== d.template) {
      const t = backTemplate(id);
      d.template = id;
      d.variant = t.variants[0].id;
      d.size = t.sizes[0];
      changes.push(t.name.toLowerCase());
      break;
    }
  }

  // A layout of this template, by name ("the board one", "receipt", "compass").
  const t = backTemplate(d.template);
  for (const v of t.variants) {
    const words = `${v.id} ${v.name}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    if (v.id !== d.variant && words.some((w) => q.includes(` ${w} `))) {
      d.variant = v.id;
      changes.push(v.name.toLowerCase());
      break;
    }
  }

  if (has(/\b(smaller|small|tiny|neck|collar|subtle|little|understated)\b/) && t.sizes.includes('neck') && d.size !== 'neck') {
    d.size = 'neck';
    changes.push('small, under the collar');
  } else if (has(/\b(bigger|big|large|huge|full|whole back)\b/) && t.sizes.includes('full') && d.size !== 'full') {
    d.size = 'full';
    changes.push('big, across the back');
  }

  if (has(/\b(match(ing)?( the)? front|same as( the)? front|like the front)\b/)) {
    if (d.palette || d.pairing) changes.push('matching the front');
    d.palette = undefined;
    d.pairing = undefined;
  } else {
    for (const [re, palette, label] of PALETTE_WORDS) {
      if (has(re)) {
        if (d.palette !== palette) {
          d.palette = palette;
          changes.push(label);
        }
        break;
      }
    }
    for (const [re, pairing, label] of PAIRING_WORDS) {
      if (has(re)) {
        if (d.pairing !== pairing) {
          d.pairing = pairing;
          changes.push(label);
        }
        break;
      }
    }
    if (!changes.some((c) => /colou?rs|blues|navy/.test(c)) && has(/\b(different|other|new) colou?rs?\b/)) {
      const order = ['lagoon', 'sunset', 'retro', 'tropical', 'navygold', 'coral', 'pastel', 'ink'];
      d.palette = order[(order.indexOf(d.palette ?? 'sunset') + 1) % order.length];
      changes.push('different colors');
    }
  }
  return { design: d, changes };
}

/** Every template id, for validating input. */
export const BACK_TEMPLATE_IDS = new Set(BACK_TEMPLATES.map((t) => t.id));
