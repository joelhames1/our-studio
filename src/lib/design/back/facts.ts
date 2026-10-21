// The "details" every back template draws from, starter details for each kind
// of occasion, and the bits we can work out from them (flights, countries).
import type { Facts, Occasion, Stat, Stop } from './types';

export const OCCASIONS: { id: Occasion; name: string }[] = [
  { id: 'trip', name: 'A trip' },
  { id: 'anniversary', name: 'An anniversary' },
  { id: 'birthday', name: 'A birthday' },
  { id: 'graduation', name: 'A graduation' },
  { id: 'reunion', name: 'A reunion' },
  { id: 'team', name: 'A team or group' },
  { id: 'everyday', name: 'Just because' },
];

const YEAR_LABELS: Record<Occasion, string> = {
  trip: 'Est.',
  anniversary: 'Est.',
  birthday: 'Vintage',
  graduation: 'Class of',
  reunion: 'Class of',
  team: 'Est.',
  everyday: 'Est.',
};

/** Starter details for a new project, so every template has something to show. */
export function blankFacts(occasion: Occasion, people: string[] = ['Alex', 'Sam']): Facts {
  const year = String(new Date().getFullYear());
  const base: Facts = {
    title: 'The Big Day',
    people,
    dates: year,
    year,
    yearLabel: YEAR_LABELS[occasion],
    bigNumber: '1',
    statement: 'Worth Every Minute',
    signature: `${people.join(' & ')} · ${year}`,
    stops: [],
    stats: [],
    timeline: [],
    place: { name: '', lat: null, lng: null },
  };
  switch (occasion) {
    case 'trip':
      return {
        ...base,
        title: 'The Grand Tour',
        statement: 'Out of Office',
        stops: [
          { code: 'JFK', place: 'New York', region: 'NY', date: 'Jun 1', stay: false },
          { code: 'LIS', place: 'Lisbon', region: 'Portugal', date: 'Jun 2', stay: true },
          { code: 'JFK', place: 'New York', region: 'NY', date: 'Jun 9', stay: true },
        ],
        stats: [
          { value: '9', label: 'days' },
          { value: '2', label: 'flights' },
          { value: '0', label: 'emails answered' },
        ],
      };
    case 'anniversary':
      return {
        ...base,
        title: 'Still Going Strong',
        year: String(Number(year) - 10),
        bigNumber: '10',
        statement: 'Still My Favorite',
        stats: [
          { value: '10', label: 'years' },
          { value: '3,652', label: 'days' },
          { value: '1', label: 'great idea' },
        ],
        timeline: [
          { year: String(Number(year) - 12), label: 'First date' },
          { year: String(Number(year) - 10), label: 'I do' },
          { year, label: 'Ten years in' },
        ],
      };
    case 'birthday':
      return {
        ...base,
        title: 'Birthday Tour',
        people: people.slice(0, 1),
        signature: `${people[0]} · ${year}`,
        year: String(Number(year) - 40),
        bigNumber: '40',
        statement: 'Aged to Perfection',
        stats: [
          { value: '40', label: 'years' },
          { value: '14,610', label: 'days' },
          { value: '∞', label: 'candles' },
        ],
      };
    case 'graduation':
      return {
        ...base,
        title: 'We Did It',
        people: people.slice(0, 1),
        signature: `${people[0]} · Class of ${year}`,
        bigNumber: year.slice(2),
        statement: 'Tassel Was Worth the Hassle',
        stats: [
          { value: '4', label: 'years' },
          { value: '1,000+', label: 'coffees' },
          { value: '1', label: 'diploma' },
        ],
      };
    case 'reunion':
      return { ...base, title: 'The Reunion Tour', statement: 'Back Together', bigNumber: '20' };
    case 'team':
      return { ...base, title: 'The Crew', statement: 'One Team', bigNumber: '00' };
    default:
      return base;
  }
}

// --- things we can work out --------------------------------------------------------

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '),
);
const CA_PROVINCES = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));

/** The country a stop is in, from its region ("CA" is California here). */
export function countryOf(stop: Pick<Stop, 'region'>): string {
  const r = stop.region.trim();
  if (US_STATES.has(r.toUpperCase())) return 'USA';
  if (CA_PROVINCES.has(r.toUpperCase())) return 'Canada';
  if (/^(usa?|united states)$/i.test(r)) return 'USA';
  if (/^(uk|united kingdom|england|scotland|wales)$/i.test(r)) return 'UK';
  return r;
}

export interface Leg {
  from: Stop;
  to: Stop;
}

export function legsOf(facts: Pick<Facts, 'stops'>): Leg[] {
  const out: Leg[] = [];
  for (let i = 0; i + 1 < facts.stops.length; i++) out.push({ from: facts.stops[i], to: facts.stops[i + 1] });
  return out;
}

/** Stops you actually stayed at (tour dates skip plane changes and the start). */
export function staysOf(facts: Pick<Facts, 'stops'>): Stop[] {
  return facts.stops.filter((s) => s.stay);
}

/** Numbers we can count from the route, offered as quick fills in the details form. */
export function derivedStats(facts: Pick<Facts, 'stops'>): Stat[] {
  const out: Stat[] = [];
  const legs = legsOf(facts).length;
  if (legs) out.push({ value: String(legs), label: legs === 1 ? 'flight' : 'flights' });
  const countries = new Set(facts.stops.map(countryOf).filter(Boolean));
  if (countries.size) out.push({ value: String(countries.size), label: countries.size === 1 ? 'country' : 'countries' });
  const places = new Set(staysOf(facts).map((s) => s.place.trim().toLowerCase()).filter(Boolean));
  if (places.size) out.push({ value: String(places.size), label: places.size === 1 ? 'stop' : 'stops' });
  return out;
}

/** 0.502, 73 → "0°30′N 73°00′E" */
export function formatCoords(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const dm = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Math.round((a - d) * 60);
    if (m === 60) {
      d += 1;
      m = 0;
    }
    return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
  };
  return `${dm(lat, 'N', 'S')} ${dm(lng, 'E', 'W')}`;
}

// --- cleaning what comes in from the form --------------------------------------------

const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown, lim: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
};

/** Trims and bounds details sent from the browser. */
export function cleanFacts(input: Partial<Facts>, fallback: Facts): Facts {
  const f = { ...fallback, ...input };
  const list = <T,>(v: unknown, max: number, map: (x: Record<string, unknown>) => T): T[] =>
    Array.isArray(v) ? v.slice(0, max).map((x) => map((x ?? {}) as Record<string, unknown>)) : [];
  const place = (f.place ?? {}) as Partial<Facts['place']>;
  return {
    title: str(f.title, 80),
    people: Array.isArray(f.people) ? f.people.map((p) => str(p, 30)).filter(Boolean).slice(0, 12) : fallback.people,
    dates: str(f.dates, 60),
    year: str(f.year, 12),
    yearLabel: str(f.yearLabel, 16),
    bigNumber: str(f.bigNumber, 4),
    statement: str(f.statement, 80),
    signature: str(f.signature, 80),
    stops: list(f.stops, 14, (s) => ({
      code: str(s.code, 4).toUpperCase(),
      place: str(s.place, 32),
      region: str(s.region, 24),
      date: str(s.date, 12),
      stay: s.stay !== false,
    })),
    stats: list(f.stats, 8, (s) => ({ value: str(s.value, 10), label: str(s.label, 24) })),
    timeline: list(f.timeline, 6, (m) => ({ year: str(m.year, 10), label: str(m.label, 40) })),
    place: {
      name: str(place.name, 40),
      lat: num(place.lat, 90),
      lng: num(place.lng, 180),
      unchecked: place.unchecked === true ? true : undefined,
    },
  };
}
