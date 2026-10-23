import type { BackTemplateId, Occasion } from '../types';
import { coordinates } from './coordinates';
import { crew } from './crew';
import { established } from './established';
import { flightPath } from './flight-path';
import { jersey } from './jersey';
import { numbers } from './numbers';
import { statement } from './statement';
import { timeline } from './timeline';
import { tourDates } from './tour-dates';
import type { BackTemplate } from './types';

export type { BackTemplate };

/** The library, in the order it's offered. */
export const BACK_TEMPLATES: BackTemplate[] = [flightPath, tourDates, numbers, timeline, established, coordinates, statement, jersey, crew];

export function backTemplate(id: BackTemplateId | string): BackTemplate {
  return BACK_TEMPLATES.find((t) => t.id === id) ?? statement;
}

/** What a template is called for a project's occasions: "Class of" on a graduation, "Year stamp" anywhere else. */
export function templateName(t: BackTemplate, occasions: readonly Occasion[] = []): string {
  for (const o of occasions) {
    const name = t.names?.[o];
    if (name) return name;
  }
  return t.name;
}
