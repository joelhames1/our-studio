// A made-up sample project for running on a laptop and for the tests: Sam and
// Alex's 25th, a week in Lisbon. It exercises everything a real project can
// (an ampersand, an apostrophe, a "quoted" word, an ordinal, a route with
// stops and dates). Real projects keep their details in their own records.
import type { Facts } from './back/types';
import type { Copy, ShirtDesign } from './types';

export const SEED_COPY: Copy = {
  headline: `Sam & Alex's 25th "Grand" Tour`,
  tagline: `Let's Go!`,
  extra: 'Lisbon · 2027',
};

export const SEED_DESIGN: ShirtDesign = {
  layout: 'stack',
  pairing: 'bebas-pacifico',
  palette: 'sunset',
  art: { kind: 'motif', motif: 'sunset-clock' },
  emphasis: 'script',
};

export const SEED_TICKET = { from: 'LAX', to: 'LIS', date: 'JUN 2027' };

/** What Claude is told about the sample. */
export const SAMPLE_CONTEXT = `Sam and Alex are celebrating their 25th anniversary with a week in Lisbon and Porto in June 2027. They love bright colours and a little cheek, never crude.`;

/** Subjects for AI artwork on the sample. */
export const SAMPLE_ART_IDEAS = [
  'a yellow tram climbing a steep cobbled hill',
  'blue and white painted tiles with a sunburst',
  'a row of sardines swimming in formation',
  'a red suspension bridge at sunset',
  'two custard tarts on a little plate',
  'terracotta rooftops above a river',
];

export const SAMPLE_ART_VIBES = ['retro-poster', 'cartoon', 'sunset', 'watercolor'];

/** Ready-made alternatives for the words step; Claude adds more when connected. */
export const COPY_IDEAS: Copy[] = [
  SEED_COPY,
  { headline: `Sam & Alex Take Lisbon`, tagline: '25 Years, One Week', extra: 'Jun 2027' },
  { headline: `The "Grand" Tour`, tagline: `Let's Go!`, extra: 'LAX · LIS · OPO · 2027' },
  { headline: 'Sam & Alex', tagline: '25 Years. Still Going.', extra: 'Lisbon · 2027' },
  { headline: 'Together Since 2002', tagline: 'The Lisbon Edition', extra: 'Sam & Alex · 2027' },
];

/** The sample's back details: a made-up route, places and dates only. */
export const SAMPLE_FACTS: Facts = {
  title: `The "Grand" Tour`,
  people: ['Sam', 'Alex'],
  dates: 'Jun 2 – 9, 2027',
  year: '2002',
  yearLabel: 'Est.',
  bigNumber: '25',
  statement: 'Worth Every Mile.',
  signature: 'Sam & Alex · Lisbon 2027',
  stops: [
    { code: 'LAX', place: 'Los Angeles', region: 'CA', date: 'Jun 2', stay: false },
    { code: 'JFK', place: 'New York', region: 'NY', date: 'Jun 2', stay: true },
    { code: 'LIS', place: 'Lisbon', region: 'Portugal', date: 'Jun 3', stay: true },
    { code: 'OPO', place: 'Porto', region: 'Portugal', date: 'Jun 6', stay: true },
    { code: 'LHR', place: 'London', region: 'UK', date: 'Jun 8', stay: true },
    { code: 'LAX', place: 'Los Angeles', region: 'CA', date: 'Jun 9', stay: true },
  ],
  stats: [
    { value: '25', label: 'years' },
    { value: '8', label: 'days' },
    { value: '5', label: 'flights' },
    { value: '12,400', label: 'miles' },
    { value: '3', label: 'countries' },
    { value: '0', label: 'regrets' },
  ],
  timeline: [
    { year: '2002', label: 'I do' },
    { year: '2027', label: 'Lisbon, at last' },
  ],
  place: { name: 'Lisbon, Portugal', lat: 38.722, lng: -9.139 },
};
