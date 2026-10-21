// Starting new projects (a birthday shirt, a graduation, another trip), and
// drafting one from a sentence. Archiving and deleting live in archive.ts.
import { cleanFacts, OCCASIONS } from '@/lib/design/back/facts';
import type { Facts, Occasion, Stop } from '@/lib/design/back/types';
import { designKey, generateFresh, seeded } from '@/lib/design/generate';
import { contextFor, factsFromBasics, preset, type Basics } from '@/lib/design/occasions';
import type { Copy } from '@/lib/design/types';
import type { User } from '@/lib/engine/types';
import type { ShirtBrief } from '@/lib/kinds/shirt';
import { record } from './activity';
import { HttpError } from './auth';
import { config } from './config';
import { newId, slugify } from './ids';
import { oneLine } from './plain';
import { draftProject, type ProjectDraft } from './llm/tasks';
import { getRepo } from './repo';
import { addOptions, starterBackOptions, type ShirtProject } from './studio';

export interface NewProjectInput {
  occasion: Occasion;
  basics: Basics;
  /** The words picked on the last step. */
  copy: Copy;
  /** The other word ideas, kept for the Words step. */
  copyIdeas?: Copy[];
  /** From Claude's draft: background for later word and art ideas. */
  context?: string;
  /** From Claude's draft: route, coordinates, a statement. */
  facts?: Partial<Pick<Facts, 'stops' | 'statement' | 'place'>>;
}

const str = (v: unknown, max: number) => oneLine(typeof v === 'number' ? String(v) : v, max);
const cleanCopy = (c: Partial<Copy> | undefined): Copy => ({ headline: str(c?.headline, 140), tagline: str(c?.tagline, 140), extra: str(c?.extra, 140) });

export function cleanBasics(b: Partial<Basics> | undefined): Basics {
  const people = Array.isArray(b?.people) ? b!.people : String(b?.people ?? '').split(',');
  return {
    title: str(b?.title, 60),
    people: people.map((p) => str(p, 30)).filter(Boolean).slice(0, 12),
    dates: str(b?.dates, 60),
    number: str(b?.number, 4),
    year: str(b?.year, 12),
    place: str(b?.place, 40),
  };
}

/** For a trip with a route: where from, where to (the first real stay), and when. */
/** One seat per person in row 1: "1A", "1A 1B", "1A–1D". */
export function seatsFor(people: number): string {
  const n = Math.min(Math.max(people, 1), 6);
  if (n <= 2) return n === 1 ? '1A' : '1A 1B';
  return `1A–1${String.fromCharCode(64 + n)}`;
}

function ticketFrom(stops: Stop[], b: Basics): ShirtBrief['ticket'] {
  const from = stops[0]?.code;
  const to = stops.find((s, i) => i > 0 && s.stay && s.code && s.code !== from)?.code;
  const date = (b.dates.match(/[A-Za-z]{3}\w*\s+\d{4}|\d{4}/)?.[0] ?? b.year).toUpperCase();
  return { from: from || 'HOME', to: to || (b.place ? b.place.slice(0, 3).toUpperCase() : 'AWAY'), date, seats: seatsFor(b.people.length || 2) };
}

export async function createProject(user: User, input: NewProjectInput): Promise<ShirtProject> {
  const occasion = input.occasion;
  if (!OCCASIONS.some((o) => o.id === occasion)) throw new HttpError(400, 'Pick what we’re celebrating.');
  const basics = cleanBasics(input.basics);
  if (!basics.title) throw new HttpError(400, 'Give it a name first.');
  const copy = cleanCopy(input.copy);
  if (!copy.headline) throw new HttpError(400, 'Pick the words for the shirt.');

  const base = factsFromBasics(occasion, basics);
  const facts = cleanFacts(
    {
      ...base,
      stops: input.facts?.stops ?? base.stops,
      statement: input.facts?.statement || base.statement,
      place: input.facts?.place ? { ...base.place, ...input.facts.place } : base.place,
    },
    base,
  );
  const ideas = [copy, ...(Array.isArray(input.copyIdeas) ? input.copyIdeas : []).map(cleanCopy).filter((c) => c.headline)];
  const seen = new Set<string>();
  const copyIdeas = ideas.filter((c) => {
    const k = `${c.headline}|${c.tagline}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const t = new Date().toISOString();
  const slug = slugify(basics.title) || occasion;
  const project: ShirtProject = {
    id: `${slug}-${newId().slice(0, 8)}`,
    kind: 'shirt',
    title: basics.title,
    createdAt: t,
    updatedAt: t,
    status: 'exploring',
    householdId: user.household,
    decisionId: null,
    createdBy: user.id,
    approver: user.id,
    brief: {
      copy,
      vibes: [],
      ticket: ticketFrom(facts.stops, basics),
      copyIdeas: copyIdeas.slice(0, 12),
      occasions: [occasion],
      facts,
      context: str(input.context, 1200) || contextFor(occasion, basics),
    },
  };
  const repo = getRepo();
  // Never over someone else's project, however unlikely the same id twice is.
  for (let tries = 1; !(await repo.addProject(project)); tries++) {
    if (tries === 3) throw new Error('Couldn’t find a free id for a new project.');
    project.id = `${slug}-${newId().slice(0, 8)}`;
  }
  // The occasion's own sample design leads the deck, then a fresh mix.
  const sample = preset(occasion).sample;
  const fronts = generateFresh({ vibes: [], count: 15, rand: seeded(Date.parse(t) % 100000), occasions: [occasion], exclude: new Set([designKey(sample)]) });
  await addOptions(project.id, 'system', 'remix', [sample, ...fronts]);
  await repo.saveOptions(starterBackOptions(project, t));
  await record(user, 'project-created', { project });
  return project;
}

/** Turns one sentence into a filled-in new-project form (nothing is saved yet). */
export async function draftFromSentence(sentence: string): Promise<{ occasion: Occasion; basics: Basics; ideas: Copy[]; context: string; facts: NonNullable<NewProjectInput['facts']> }> {
  if (!config.anthropicKey) throw new HttpError(400, 'Claude isn’t connected yet, so fill in the form instead.');
  const text = sentence.trim();
  if (text.length < 4) throw new HttpError(400, 'Tell me a little about it first.');
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const d: ProjectDraft = await draftProject(text, today);
  const basics = cleanBasics({ title: d.title, people: d.people, dates: d.dates, number: d.number, year: d.year, place: d.place });
  const valid = (n: number | null, lim: number) => (n !== null && Number.isFinite(n) && Math.abs(n) <= lim ? n : null);
  const lat = valid(d.latitude, 90);
  const lng = valid(d.longitude, 180);
  return {
    occasion: d.occasion,
    basics,
    ideas: d.words.map(cleanCopy).filter((c) => c.headline).slice(0, 6),
    context: str(d.context, 1200),
    facts: {
      stops: d.stops.slice(0, 14).map((s) => ({ code: str(s.code, 4).toUpperCase(), place: str(s.place, 32), region: str(s.region, 24), date: str(s.date, 12), stay: s.stay })),
      statement: str(d.statement, 80),
      // Coordinates from a model are a guess until someone checks a map.
      place: lat !== null && lng !== null ? { name: basics.place, lat, lng, unchecked: true } : { name: basics.place, lat: null, lng: null },
    },
  };
}
