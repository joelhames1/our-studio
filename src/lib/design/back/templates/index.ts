import type { BackTemplateId } from '../types';
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
