// What each kind of occasion brings with it: the questions to ask, the artwork
// and vibes that fit, starter words, and the back details it begins with.
import { blankFacts } from './back/facts';
import type { Facts, Occasion } from './back/types';
import type { Copy, MotifId, ShirtDesign } from './types';

/** What the new-project screen asks for. Everything but the title is optional. */
export interface Basics {
  title: string;
  people: string[];
  dates: string;
  /** Age, years together, a jersey number. */
  number: string;
  /** Born in, married in, class of. */
  year: string;
  /** Where to (trips), the school (graduations), where (anything else). */
  place: string;
}

export interface OccasionPreset {
  id: Occasion;
  short: string;
  /** For sentences: "a birthday". */
  noun: string;
  blurb: string;
  icon: string;
  labels: {
    title: string;
    titlePlaceholder: string;
    people: string;
    peoplePlaceholder: string;
    datesPlaceholder: string;
    number?: string;
    year?: string;
    place?: string;
    placePlaceholder?: string;
  };
  /** Built-in artwork that suits it, for the front. */
  motifs: MotifId[];
  /** Subjects for AI artwork when Claude isn't there to art-direct. */
  artIdeas: string[];
  /** How the occasion looks on the new-project screen. */
  sample: ShirtDesign;
  /** Filled-in basics for previews and the contact sheet. */
  example: Basics;
  statement: string;
  copyIdeas: (b: Basics) => Copy[];
}

// --- little word helpers ---------------------------------------------------------

/** 31 → 31st, 12 → 12th, 22 → 22nd. Anything that isn't a whole number is left alone. */
export function ordinal(n: string): string {
  const t = n.trim();
  if (!/^\d+$/.test(t)) return t;
  const v = Number(t) % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] ?? 'th';
  return `${t}${suffix}`;
}

/** "Sam's", "James'". */
export function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

export function names(people: string[]): string {
  const p = people.map((x) => x.trim()).filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  if (p.length === 2) return `${p[0]} & ${p[1]}`;
  return `${p.slice(0, -1).join(', ')} & ${p[p.length - 1]}`;
}

const thisYear = () => String(new Date().getFullYear());

/**
 * A name for the project from what's been filled in so far ("Sam's Graduation",
 * "Maya's 40th", "Lisbon 2027"), or null when there's nothing to go on or the
 * occasion has no natural one.
 */
export function suggestedTitle(occasion: Occasion, b: Pick<Basics, 'people' | 'number' | 'place' | 'dates'>): string | null {
  const people = b.people.map((x) => x.trim()).filter(Boolean);
  const who = names(people);
  const year = b.dates.match(/\b(19|20)\d{2}\b/)?.[0];
  switch (occasion) {
    case 'graduation':
      return people[0] ? `${possessive(people[0])} Graduation` : null;
    case 'birthday':
      if (!people[0]) return null;
      return /^\d+$/.test(b.number.trim()) ? `${possessive(people[0])} ${ordinal(b.number)}` : `${possessive(people[0])} Birthday`;
    case 'anniversary':
      if (/^\d+$/.test(b.number.trim())) return `Our ${ordinal(b.number)}`;
      return who ? `${possessive(who)} Anniversary` : null;
    case 'trip':
      if (b.place.trim()) return year ? `${b.place.trim()} ${year}` : b.place.trim();
      return who ? `${possessive(who)} Trip` : null;
    default:
      return null;
  }
}

/** Keeps the ideas whose words all filled in, then tops up with fallbacks. */
function finish(ideas: (Copy | null)[], fallbacks: Copy[]): Copy[] {
  const ok = (c: Copy | null): c is Copy => !!c && !!c.headline.trim() && !/\b(undefined|null)\b|''s|^\s*'s/.test(`${c.headline} ${c.tagline}`);
  const out = ideas.filter(ok);
  const seen = new Set(out.map((c) => c.headline.toLowerCase()));
  for (const f of fallbacks) {
    if (out.length >= 6) break;
    if (!seen.has(f.headline.toLowerCase())) {
      seen.add(f.headline.toLowerCase());
      out.push(f);
    }
  }
  return out.slice(0, 6).map((c) => ({ headline: c.headline.trim(), tagline: c.tagline.trim(), extra: c.extra.trim() }));
}

const when = (b: Basics) => b.dates.trim() || b.year.trim();

// --- the presets ------------------------------------------------------------------------

const TRIP: OccasionPreset = {
  id: 'trip',
  short: 'Trip',
  noun: 'a trip',
  blurb: 'Matching shirts for the journey',
  icon: 'plane',
  labels: {
    title: 'What should we call it?',
    titlePlaceholder: 'Lisbon 2027',
    people: 'Who’s going?',
    peoplePlaceholder: 'Sam, Alex',
    datesPlaceholder: 'Jun 2 – 9, 2027',
    place: 'Where to?',
    placePlaceholder: 'Lisbon',
  },
  motifs: ['sunset', 'sunset-palm', 'sunset-clock', 'clock', 'hourglass-island', 'bungalow-sunset', 'plane-sun', 'palm-duo', 'sun-rays'],
  artIdeas: [
    'a vintage suitcase covered in travel stickers',
    'a small plane flying over rolling hills toward the sun',
    'a hot air balloon drifting over a valley',
    'a compass rose on a folded paper map',
    'a winding coastal road at sunset',
    'a classic camper van under a starry sky',
  ],
  sample: { layout: 'badge', pairing: 'bebas-pacifico', palette: 'lagoon', art: { kind: 'motif', motif: 'plane-sun' } },
  example: { title: 'Lisbon 2027', people: ['Sam', 'Alex'], dates: 'Jun 2 – 9, 2027', number: '', year: '2027', place: 'Lisbon' },
  statement: 'Out of Office',
  copyIdeas: (b) => {
    const place = b.place.trim() || b.title.trim();
    const who = names(b.people);
    const yr = b.year.trim() || (b.dates.match(/\d{4}/)?.[0] ?? thisYear());
    return finish(
      [
        { headline: `${place} or Bust`, tagline: who, extra: when(b) },
        who ? { headline: `${who} Take ${place}`, tagline: 'Out of Office', extra: when(b) } : null,
        { headline: `The ${place} Tour`, tagline: `"${yr}"`, extra: who },
        { headline: 'Out of Office', tagline: `${place} · ${yr}`, extra: who },
        { headline: 'Wish You Were Here', tagline: place, extra: when(b) },
        { headline: 'Passport: Stamped', tagline: `${place} ${yr}`, extra: who },
      ],
      [
        { headline: 'Gone Exploring', tagline: place, extra: when(b) },
        { headline: 'Adventure Awaits', tagline: place, extra: who },
      ],
    );
  },
};

const ANNIVERSARY: OccasionPreset = {
  id: 'anniversary',
  short: 'Anniversary',
  noun: 'an anniversary',
  blurb: 'Years together, worth a shirt',
  icon: 'heart',
  labels: {
    title: 'What should we call it?',
    titlePlaceholder: 'Our 10th',
    people: 'The happy couple',
    peoplePlaceholder: 'Sam, Alex',
    datesPlaceholder: 'Sep 2027',
    number: 'How many years?',
    year: 'Married in',
  },
  motifs: ['hearts', 'champagne', 'laurel', 'sunset', 'sun-rays'],
  artIdeas: [
    'two swans on a still lake forming a heart',
    'two coffee mugs side by side, steam curling into a heart',
    'a pair of bicycles leaning together',
    'two hands toasting with champagne glasses',
    'a vintage wedding car with cans trailing behind',
  ],
  sample: { layout: 'stack', pairing: 'playfair-montserrat', palette: 'sunset', art: { kind: 'motif', motif: 'hearts' } },
  example: { title: 'Our 10th', people: ['Sam', 'Alex'], dates: 'Sep 2027', number: '10', year: '2017', place: '' },
  statement: 'Still My Favorite',
  copyIdeas: (b) => {
    const who = names(b.people);
    const n = b.number.trim();
    return finish(
      [
        who && n ? { headline: who, tagline: `${n} Years. Still My Favorite.`, extra: b.year ? `Est. ${b.year}` : when(b) } : null,
        n ? { headline: `The ${ordinal(n)} Anniversary Tour`, tagline: 'Still Going Strong', extra: who } : null,
        n ? { headline: `${n} Years of "Us"`, tagline: who, extra: when(b) } : null,
        b.year ? { headline: `Est. ${b.year}`, tagline: [who, n && `${n} Years`].filter(Boolean).join(' · '), extra: when(b) } : null,
        { headline: 'Still Crazy About You', tagline: n ? `${ordinal(n)} Anniversary` : 'Happy Anniversary', extra: who },
        { headline: 'Happily Ever After', tagline: n ? `${n} Years In` : who, extra: when(b) },
      ],
      [
        { headline: 'Still Going Strong', tagline: who, extra: when(b) },
        { headline: 'Better Together', tagline: who, extra: when(b) },
        { headline: b.title, tagline: who, extra: when(b) },
      ],
    );
  },
};

const BIRTHDAY: OccasionPreset = {
  id: 'birthday',
  short: 'Birthday',
  noun: 'a birthday',
  blurb: 'Cake, candles, the works',
  icon: 'cake',
  labels: {
    title: 'What should we call it?',
    titlePlaceholder: 'Mom’s 70th',
    people: 'Whose birthday?',
    peoplePlaceholder: 'Mom',
    datesPlaceholder: 'Jun 14, 2027',
    number: 'Turning',
    year: 'Born in',
  },
  motifs: ['balloons', 'cake', 'confetti', 'champagne', 'sun-rays'],
  artIdeas: [
    'a stack of wrapped presents with big bows',
    'a party hat with streamers',
    'a disco ball throwing sparkles',
    'a cupcake with one candle',
    'a piñata shaped like a star',
  ],
  sample: { layout: 'stack', pairing: 'shrikhand-fredoka', palette: 'coral', art: { kind: 'motif', motif: 'balloons' } },
  example: { title: 'Maya’s 40th', people: ['Maya'], dates: 'Jun 14, 2027', number: '40', year: '1987', place: '' },
  statement: 'Aged to Perfection',
  copyIdeas: (b) => {
    const name = b.people[0]?.trim() || '';
    const n = b.number.trim();
    return finish(
      [
        name && n ? { headline: `${possessive(name)} ${ordinal(n)}`, tagline: 'Aged to Perfection', extra: when(b) } : null,
        b.year ? { headline: `Vintage ${b.year}`, tagline: name && n ? `${name} Turns ${n}` : 'Limited Edition', extra: b.dates } : null,
        n ? { headline: `"${n}" Looks Good on ${name || 'You'}`, tagline: 'Party Like a Legend', extra: when(b) } : null,
        name ? { headline: `${possessive(name)} Birthday Tour`, tagline: n ? `The ${ordinal(n)} Edition` : 'One Night Only', extra: when(b) } : null,
        { headline: 'Make a Wish', tagline: [name, n].filter(Boolean).join(' · '), extra: when(b) },
        n ? { headline: `Level ${n} Unlocked`, tagline: name ? `Happy Birthday, ${name}` : 'Happy Birthday', extra: when(b) } : null,
      ],
      [
        { headline: 'Aged to Perfection', tagline: name, extra: when(b) },
        { headline: 'Party Like a Legend', tagline: name, extra: when(b) },
        { headline: b.title, tagline: 'Happy Birthday', extra: when(b) },
      ],
    );
  },
};

const GRADUATION: OccasionPreset = {
  id: 'graduation',
  short: 'Graduation',
  noun: 'a graduation',
  blurb: 'Caps off to the grad',
  icon: 'cap',
  labels: {
    title: 'What should we call it?',
    titlePlaceholder: 'Sam’s Graduation',
    people: 'Who’s graduating?',
    peoplePlaceholder: 'Sam',
    datesPlaceholder: 'May 2027',
    year: 'Class of',
    place: 'School',
    placePlaceholder: 'Springfield High',
  },
  motifs: ['grad-cap', 'laurel', 'confetti', 'sun-rays'],
  artIdeas: [
    'a stack of books with a graduation cap on top',
    'a diploma scroll tied with a ribbon',
    'an owl wearing a tiny graduation cap',
    'caps thrown in the air against the sky',
  ],
  sample: { layout: 'arch', pairing: 'alfa-lobster', palette: 'navygold', art: { kind: 'motif', motif: 'grad-cap' } },
  example: { title: 'Sam’s Graduation', people: ['Sam'], dates: 'May 2027', number: '', year: '2027', place: 'Springfield High' },
  statement: 'Tassel Was Worth the Hassle',
  copyIdeas: (b) => {
    const name = b.people[0]?.trim() || '';
    const yr = b.year.trim() || thisYear();
    const school = b.place.trim();
    return finish(
      [
        { headline: `Class of ${yr}`, tagline: name ? `${name} Did It!` : 'We Did It!', extra: school },
        { headline: 'Tassel Was Worth the Hassle', tagline: [name, yr].filter(Boolean).join(' · '), extra: school },
        { headline: `Officially "Graduated"`, tagline: `Class of ${yr}`, extra: [name, school].filter(Boolean).join(' · ') },
        name ? { headline: `${possessive(name)} Grad Party`, tagline: 'Caps Off!', extra: when(b) } : null,
        { headline: 'The Future Is Here', tagline: name, extra: `Class of ${yr}` },
        name ? { headline: 'Proud Family', tagline: `${name}, Class of ${yr}`, extra: school } : null,
      ],
      [
        { headline: 'Caps Off!', tagline: `Class of ${yr}`, extra: school },
        { headline: 'Nailed It', tagline: `Class of ${yr}`, extra: name },
      ],
    );
  },
};

const REUNION: OccasionPreset = {
  id: 'reunion',
  short: 'Reunion',
  noun: 'a reunion',
  blurb: 'The whole crew, back together',
  icon: 'users',
  labels: {
    title: 'Which group?',
    titlePlaceholder: 'The Rivera Family',
    people: 'Who’s coming?',
    peoplePlaceholder: 'Ana, Luis, Sam, Maya',
    datesPlaceholder: 'Jul 4, 2027',
    number: 'Years since (optional)',
    year: 'Since / class of',
    place: 'Where?',
    placePlaceholder: 'The lake house',
  },
  motifs: ['laurel', 'confetti', 'champagne', 'sun-rays', 'hearts', 'sunset'],
  artIdeas: ['a picnic table under a big oak tree', 'a campfire with marshmallows on sticks', 'a group of mismatched lawn chairs', 'a lakeside dock at sunset'],
  sample: { layout: 'badge', pairing: 'oswald-pacifico', palette: 'retro', art: { kind: 'motif', motif: 'laurel' } },
  example: { title: 'The Rivera Family', people: ['Ana', 'Luis', 'Sam', 'Maya'], dates: 'Jul 4, 2027', number: '', year: '', place: 'The lake house' },
  statement: 'Back Together',
  copyIdeas: (b) => {
    const group = b.title.trim();
    const n = b.number.trim();
    return finish(
      [
        { headline: group, tagline: 'Back Together Again', extra: [b.place, when(b)].filter(Boolean).join(' · ') },
        b.year ? { headline: `Class of ${b.year}`, tagline: 'Still Got It', extra: when(b) } : null,
        { headline: `${group}: The Reunion Tour`, tagline: when(b), extra: b.place },
        { headline: `The Gang's All Here`, tagline: group, extra: when(b) },
        n ? { headline: `${n} Years Later`, tagline: group, extra: when(b) } : null,
        { headline: 'Good Times, Great People', tagline: group, extra: [b.place, when(b)].filter(Boolean).join(' · ') },
      ],
      [
        { headline: 'Back Together', tagline: group, extra: when(b) },
        { headline: 'Still Got It', tagline: group, extra: [b.place, when(b)].filter(Boolean).join(' · ') },
        { headline: 'Same Crew, More Stories', tagline: group, extra: when(b) },
      ],
    );
  },
};

const TEAM: OccasionPreset = {
  id: 'team',
  short: 'Team',
  noun: 'a team or group',
  blurb: 'Team shirts, club shirts, race day',
  icon: 'trophy',
  labels: {
    title: 'Team name',
    titlePlaceholder: 'The Fast Turtles',
    people: 'Who’s on it?',
    peoplePlaceholder: 'Sam, Alex',
    datesPlaceholder: 'Race day, Oct 2027',
    number: 'Number (for jerseys)',
    year: 'Since',
  },
  motifs: ['laurel', 'sun-rays', 'confetti'],
  artIdeas: ['a winged sneaker', 'a trophy cup with ribbons', 'a lightning bolt through a star', 'a mascot animal wearing a headband'],
  sample: { layout: 'arch', pairing: 'anton-yellowtail', palette: 'navygold', art: { kind: 'motif', motif: 'laurel' } },
  example: { title: 'The Fast Turtles', people: ['Jo', 'Ray'], dates: 'Oct 2027', number: '7', year: '2024', place: '' },
  statement: 'One Team',
  copyIdeas: (b) => {
    const team = b.title.trim();
    return finish(
      [
        { headline: team, tagline: 'One Team', extra: when(b) },
        { headline: team, tagline: 'All In', extra: b.year ? `Est. ${b.year}` : when(b) },
        { headline: 'Better Together', tagline: team, extra: when(b) },
        b.year ? { headline: `Est. ${b.year}`, tagline: team, extra: when(b) } : null,
        { headline: 'Squad Goals', tagline: team, extra: when(b) },
        { headline: `${team} Crew`, tagline: when(b), extra: names(b.people) },
      ],
      [
        { headline: 'Go Team', tagline: team, extra: when(b) },
        { headline: 'Never Quit', tagline: team, extra: when(b) },
      ],
    );
  },
};

const EVERYDAY: OccasionPreset = {
  id: 'everyday',
  short: 'Just because',
  noun: 'a just-because shirt',
  blurb: 'A moment worth a shirt',
  icon: 'sparkles',
  labels: {
    title: 'What should we call it?',
    titlePlaceholder: 'Summer of Yes',
    people: 'Who’s it for?',
    peoplePlaceholder: 'Sam, Alex',
    datesPlaceholder: 'Summer 2027',
    place: 'Where? (optional)',
    placePlaceholder: 'Springfield',
  },
  motifs: ['hearts', 'sun-rays', 'confetti', 'sunset', 'laurel'],
  artIdeas: ['a sun wearing sunglasses', 'a coffee cup with a smiling face', 'a paper airplane looping through the sky', 'a cactus in a pot with one flower'],
  sample: { layout: 'stack', pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sun-rays' } },
  example: { title: 'Summer of Yes', people: ['Sam', 'Alex'], dates: 'Summer 2027', number: '', year: '', place: '' },
  statement: 'Worth Every Minute',
  copyIdeas: (b) => {
    const who = names(b.people);
    return finish(
      [
        { headline: b.title, tagline: 'Worth Every Minute', extra: when(b) },
        who ? { headline: who, tagline: b.title, extra: when(b) } : null,
        { headline: 'Good Times', tagline: b.title, extra: when(b) },
        { headline: 'Making Memories', tagline: who, extra: when(b) },
        { headline: 'Here for It', tagline: b.title, extra: who },
        { headline: 'No Bad Days', tagline: b.title, extra: when(b) },
      ],
      [],
    );
  },
};

export const OCCASION_PRESETS: OccasionPreset[] = [TRIP, ANNIVERSARY, BIRTHDAY, GRADUATION, REUNION, TEAM, EVERYDAY];

export function preset(id: Occasion | string): OccasionPreset {
  return OCCASION_PRESETS.find((p) => p.id === id) ?? EVERYDAY;
}

/** Built-in artwork that suits any of these occasions. */
export function motifsFor(occasions: Occasion[]): MotifId[] {
  const list = occasions.length ? occasions : (['everyday'] as Occasion[]);
  return [...new Set(list.flatMap((o) => preset(o).motifs))];
}

/** Back details from what was typed in, with nothing made up. */
export function factsFromBasics(occasion: Occasion, b: Basics): Facts {
  const p = preset(occasion);
  const people = b.people.map((x) => x.trim()).filter(Boolean);
  const base = blankFacts(occasion, people.length ? people : [b.title || 'You']);
  const n = Number(b.number);
  const stats =
    (occasion === 'birthday' || occasion === 'anniversary') && Number.isInteger(n) && n > 0
      ? [
          { value: String(n), label: 'years' },
          { value: Math.round(n * 365.25).toLocaleString('en-US'), label: 'days' },
          occasion === 'birthday' ? { value: '0', label: 'regrets' } : { value: '1', label: 'great idea' },
        ]
      : [];
  const timeline =
    occasion === 'anniversary' && b.year.trim()
      ? [
          { year: b.year.trim(), label: 'I do' },
          { year: thisYear(), label: Number.isInteger(n) && n > 0 ? `${n} years in` : 'Still going' },
        ]
      : [];
  const yearLabel = occasion === 'graduation' ? 'Class of' : occasion === 'birthday' ? 'Vintage' : base.yearLabel;
  return {
    ...base,
    title: b.title.trim(),
    people,
    dates: b.dates.trim(),
    year: b.year.trim() || (occasion === 'trip' || occasion === 'graduation' ? b.dates.match(/\d{4}/)?.[0] ?? '' : ''),
    yearLabel,
    bigNumber: b.number.trim() || (occasion === 'graduation' && b.year.trim() ? b.year.trim().slice(-2) : ''),
    statement: p.statement,
    signature: [names(people) || b.title.trim(), occasion === 'trip' ? b.place.trim() : '', b.dates.trim() || b.year.trim()].filter(Boolean).join(' · '),
    stops: [],
    stats,
    timeline,
    place: { name: occasion === 'graduation' ? '' : b.place.trim(), lat: null, lng: null },
  };
}

/** A sentence about the project, for Claude when it writes words or art-directs. */
export function contextFor(occasion: Occasion, b: Basics): string {
  const p = preset(occasion);
  const bits = [`They're making T-shirts for ${p.noun}: "${b.title.trim()}".`];
  const who = names(b.people);
  if (who) bits.push(`${occasion === 'birthday' || occasion === 'graduation' ? 'It’s for' : 'The people:'} ${who}.`);
  if (b.number.trim() && p.labels.number) bits.push(`${p.labels.number.replace(/\?$/, '')}: ${b.number.trim()}.`);
  if (b.year.trim() && p.labels.year) bits.push(`${p.labels.year}: ${b.year.trim()}.`);
  if (b.place.trim() && p.labels.place) bits.push(`${p.labels.place.replace(/\?$/, '').replace(/ \(optional\)$/, '')}: ${b.place.trim()}.`);
  if (b.dates.trim()) bits.push(`When: ${b.dates.trim()}.`);
  bits.push('Their taste: fun and a little cheeky, never crude.');
  return bits.join(' ');
}
