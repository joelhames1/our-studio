// Back prints: every template draws, the details are sound, styles follow the
// front, tweaks work, and an approval with a back produces back print files.
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { tempRepo } from './helpers';
import { loadAllFonts } from '@/lib/server/fonts';
import { BACK_TEMPLATES } from '@/lib/design/back/templates';
import { backStyle, backWords, renderBack, resolveBack } from '@/lib/design/back/render';
import { blankFacts, cleanFacts, countryOf, derivedStats, formatCoords, OCCASIONS } from '@/lib/design/back/facts';
import { backKey, freshBacks, similarBacks, starterBacks } from '@/lib/design/back/generate';
import { heuristicBackTweak } from '@/lib/design/back/tweak';
import type { BackDesign, Facts } from '@/lib/design/back/types';
import { seeded } from '@/lib/design/generate';
import { SAMPLE_FACTS, SEED_COPY, SEED_DESIGN } from '@/lib/design/seed';
import type { FontSet } from '@/lib/design/types';
import { USERS } from '@/lib/server/auth';
import { approve, buildPackage, wearerNames } from '@/lib/server/decisions';
import { ensureSeed, projectState, react, remixBacks, SEED_PROJECT_ID, updateBrief } from '@/lib/server/studio';
import { tweakBack } from '@/lib/server/backs';
import { PDFDocument } from 'pdf-lib';

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadAllFonts();
});

const ctx = (facts: Facts, shirt: { hex: string; tone: 'light' | 'dark' }, wearer?: string) => ({
  fonts,
  copy: SEED_COPY,
  tone: shirt.tone,
  shirtHex: shirt.hex,
  assetHref: (k: string) => k,
  facts,
  wearer,
});

const WHITE = { hex: '#FFFFFF', tone: 'light' as const };
const NAVY = { hex: '#1E2740', tone: 'dark' as const };

describe('back templates', () => {
  for (const t of BACK_TEMPLATES) {
    for (const v of t.variants) {
      it(`${t.name} / ${v.name} draws on light and dark shirts`, () => {
        for (const shirt of [WHITE, NAVY]) {
          const back: BackDesign = { template: t.id, variant: v.id, size: t.sizes[0] };
          const svg = renderBack(back, ctx(SAMPLE_FACTS, shirt, 'Erin'), SEED_DESIGN);
          expect(svg.length).toBeGreaterThan(500);
          expect(svg).not.toMatch(/NaN|undefined|Infinity/);
          // Words are outlines, never live text the shop's computer could swap fonts on.
          expect(svg).not.toMatch(/<text/);
          // Fitted inside the canvas.
          const m = svg.match(/^<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">/)!;
          expect(Number(m[3])).toBeGreaterThan(0.3);
          expect(backWords(back, ctx(SAMPLE_FACTS, shirt, 'Erin'), SEED_DESIGN).length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('copes with starter details for every occasion, and with empty ones', () => {
    for (const { id } of OCCASIONS) {
      const facts = blankFacts(id);
      for (const t of BACK_TEMPLATES) {
        for (const v of t.variants) {
          const svg = renderBack({ template: t.id, variant: v.id, size: t.sizes[0] }, ctx(facts, WHITE), SEED_DESIGN);
          expect(svg).not.toMatch(/NaN|undefined/);
        }
      }
    }
    const empty = cleanFacts({}, { ...blankFacts('everyday'), people: [], stops: [], stats: [], timeline: [], title: '', statement: '', signature: '', dates: '', year: '' });
    for (const t of BACK_TEMPLATES) {
      for (const v of t.variants) {
        expect(renderBack({ template: t.id, variant: v.id, size: 'full' }, ctx(empty, WHITE), SEED_DESIGN)).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('lists exactly what it prints', () => {
    const words = backWords({ template: 'statement', variant: 'stacked', size: 'full' }, ctx(SAMPLE_FACTS, WHITE), SEED_DESIGN);
    expect(words).toEqual(['WORTH EVERY MILE.', 'SAM & ALEX · LISBON 2027']);
    const route = backWords({ template: 'flight-path', variant: 'line', size: 'full' }, ctx(SAMPLE_FACTS, WHITE), SEED_DESIGN);
    expect(route[0]).toBe('THE “Grand” TOUR');
    expect(route).toContain('OPO');
    expect(route).toContain('LISBON, PORTUGAL');
    const board = backWords({ template: 'flight-path', variant: 'board', size: 'full' }, ctx(SAMPLE_FACTS, WHITE), SEED_DESIGN);
    expect(board).toContain('JUN 2 LAX JFK LANDED');
    expect(board).toContain('JUN 9 LHR LAX HOME');
  });

  it('puts each wearer’s own name on a jersey', () => {
    const jersey: BackDesign = { template: 'jersey', variant: 'straight', size: 'full' };
    expect(backWords(jersey, ctx(SAMPLE_FACTS, WHITE, 'Erin'), SEED_DESIGN)[0]).toBe('ERIN');
    expect(backWords(jersey, ctx(SAMPLE_FACTS, WHITE, 'Joel'), SEED_DESIGN)[0]).toBe('JOEL');
    expect(wearerNames([{ who: 'Erin', size: 'M', qty: 1 }, { who: 'erin', size: 'S', qty: 1 }, { who: 'Joel', size: 'L', qty: 1 }], ['X'])).toEqual(['Erin', 'Joel']);
    expect(wearerNames([{ who: '', size: 'M', qty: 2 }], ['Joel', 'Erin'])).toEqual(['Joel', 'Erin']);
  });
});

describe('back details', () => {
  it('counts the sample route: 5 flights, 3 countries', () => {
    const d = derivedStats(SAMPLE_FACTS);
    expect(d).toContainEqual({ value: '5', label: 'flights' });
    expect(d).toContainEqual({ value: '3', label: 'countries' });
    expect(countryOf({ region: 'CA' })).toBe('USA');
    expect(countryOf({ region: 'ON' })).toBe('Canada');
    expect(countryOf({ region: 'Portugal' })).toBe('Portugal');
  });

  it('keeps booking details out of the facts', () => {
    const all = JSON.stringify(SAMPLE_FACTS);
    // Only codes, places and dates: no flight numbers, confirmation codes or seats.
    expect(all).not.toMatch(/\b(UA|QR|EY|AA)\d{2,4}\b/);
    expect(all).not.toMatch(/\b\d{8,}\b/);
  });

  it('formats coordinates like a map', () => {
    expect(formatCoords(38.722, -9.139)).toBe('38°43′N 9°08′W');
    expect(formatCoords(-33.8688, 151.2093)).toBe('33°52′S 151°13′E');
    expect(formatCoords(40.9999, -73.99999)).toBe('41°00′N 74°00′W');
    expect(formatCoords(null, 3)).toBe('');
  });

  it('cleans what comes in from the form', () => {
    const f = cleanFacts(
      {
        title: 'x'.repeat(500),
        people: ['  Erin ', '', 'Joel'],
        stops: Array.from({ length: 30 }, () => ({ code: 'lax1x', place: 'LA', region: 'CA', date: 'Jun 2', stay: false })),
        place: { name: 'Lisbon', lat: '0.5' as unknown as number, lng: 999 },
      },
      SAMPLE_FACTS,
    );
    expect(f.title).toHaveLength(80);
    expect(f.people).toEqual(['Erin', 'Joel']);
    expect(f.stops).toHaveLength(14);
    expect(f.stops[0].code).toBe('LAX1');
    expect(f.stops[0].stay).toBe(false);
    expect(f.place).toEqual({ name: 'Lisbon', lat: 0.5, lng: null, unchecked: undefined });
    // Anything not sent keeps its current value.
    expect(f.stats).toEqual(SAMPLE_FACTS.stats);
  });
});

describe('back styles and ideas', () => {
  it('follows the front unless it has its own fonts and colors', () => {
    const front = { pairing: 'abril-josefin', palette: 'lagoon', emphasis: 'color' as const };
    const back: BackDesign = { template: 'numbers', variant: 'grid', size: 'full' };
    expect(backStyle(back, front)).toEqual({ pairing: 'abril-josefin', palette: 'lagoon', emphasis: 'color' });
    expect(backStyle({ ...back, palette: 'retro' }, front).palette).toBe('retro');
    expect(resolveBack(back, front)).toEqual({ ...back, pairing: 'abril-josefin', palette: 'lagoon' });
    // Different fronts, different backs.
    const a = renderBack(back, ctx(SAMPLE_FACTS, WHITE), front);
    const b = renderBack(back, ctx(SAMPLE_FACTS, WHITE), SEED_DESIGN);
    expect(a).not.toBe(b);
  });

  it('carries the word colors picked on the front, unless it has its own colors', () => {
    const plain = { pairing: 'abril-josefin', palette: 'lagoon', emphasis: 'color' as const };
    const front = { ...plain, colors: { headline: '#F2654E', tagline: '#C8963E', extra: '#3E8E41' } };
    const back: BackDesign = { template: 'statement', variant: 'stacked', size: 'full' };
    const fills = (svg: string) => new Set([...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()));
    const colored = fills(renderBack(back, ctx(SAMPLE_FACTS, WHITE), front));
    expect(colored.has('#F2654E')).toBe(true); // the statement, in the big words' color
    expect(colored.has('#C8963E')).toBe(true); // the signature, in the small words' color
    const script = fills(renderBack({ ...back, variant: 'script' }, ctx(SAMPLE_FACTS, WHITE), front));
    expect(script.has('#3E8E41')).toBe(true); // the names line, in the tiny line's color
    // A back with its own color scheme keeps it.
    const own = fills(renderBack({ ...back, palette: 'retro' }, ctx(SAMPLE_FACTS, WHITE), front));
    expect(own.has('#F2654E')).toBe(false);
    // Frozen at approval with the colors, so the print files match what was approved.
    const frozen = resolveBack(back, front);
    expect(frozen.colors).toEqual(front.colors);
    expect(renderBack(frozen, ctx(SAMPLE_FACTS, WHITE), plain)).toBe(renderBack(back, ctx(SAMPLE_FACTS, WHITE), front));
    expect(resolveBack({ ...back, palette: 'retro' }, front).colors).toBeUndefined();
    // Junk in stored colors never reaches the markup.
    const junk = renderBack({ ...frozen, colors: { headline: '"/><script>' } as never }, ctx(SAMPLE_FACTS, WHITE), plain);
    expect(junk).not.toContain('<script');
  });

  it('starts a trip’s backs with the route', () => {
    const starters = starterBacks(['trip', 'anniversary'], SAMPLE_FACTS);
    expect(starters[0]).toEqual({ template: 'flight-path', variant: 'line', size: 'full' });
    expect(starters.some((s) => s.template === 'crew')).toBe(false); // two people isn't a crew
    expect(starters.find((s) => s.template === 'established')!.size).toBe('neck');
    expect(new Set(starters.map(backKey)).size).toBe(starters.length);
  });

  it('makes fresh and similar ideas without repeats', () => {
    const exclude = new Set(starterBacks(['trip'], SAMPLE_FACTS).map(backKey));
    const fresh = freshBacks({ occasions: ['trip'], facts: SAMPLE_FACTS, count: 6, exclude, rand: seeded(5) });
    expect(fresh).toHaveLength(6);
    for (const d of fresh) expect(exclude.has(backKey(d))).toBe(false);
    const base: BackDesign = { template: 'established', variant: 'stamp', size: 'neck' };
    const similar = similarBacks(base, { count: 4, rand: seeded(2) });
    expect(similar).toHaveLength(4);
    expect(similar.every((d) => d.template === 'established')).toBe(true);
  });

  it('understands plain-English changes', () => {
    const base: BackDesign = { template: 'established', variant: 'stamp', size: 'full' };
    expect(heuristicBackTweak(base, 'make it smaller').design.size).toBe('neck');
    expect(heuristicBackTweak(base, 'navy and gold please').design.palette).toBe('navygold');
    expect(heuristicBackTweak({ template: 'numbers', variant: 'grid', size: 'full' }, 'the receipt one').design.variant).toBe('receipt');
    expect(heuristicBackTweak({ template: 'statement', variant: 'stacked', size: 'full' }, 'show the flight route').design.template).toBe('flight-path');
    const own = { ...base, palette: 'retro', pairing: 'spacemono' };
    expect(heuristicBackTweak(own, 'match the front').design).toEqual(base);
    expect(heuristicBackTweak(base, 'hmm').changes).toEqual([]);
  });
});

describe('backs in the project', () => {
  it('seeds backs, saves details, and prints a back per person', async () => {
    const { repo } = tempRepo();
    await ensureSeed();
    const erin = USERS.erin;
    const joel = USERS.joel;
    let state = await projectState(SEED_PROJECT_ID, erin);
    expect(state.options.every((o) => o.kind === 'shirt')).toBe(true);
    expect(state.backs.length).toBeGreaterThan(12);
    expect(state.backs[0].payload.template).toBe('flight-path');
    expect(state.facts.stops).toHaveLength(6);

    // Edit a stop: every back picks it up.
    await updateBrief(SEED_PROJECT_ID, { facts: { ...state.facts, stops: state.facts.stops.map((s) => (s.code === 'JFK' ? { ...s, place: 'New York City' } : s)) } });
    state = await projectState(SEED_PROJECT_ID, erin);
    expect(state.facts.stops[1].place).toBe('New York City');

    const more = await remixBacks(erin, SEED_PROJECT_ID, { count: 3 });
    expect(more).toHaveLength(3);
    // Remixes are random and can already be navy and gold; tweak one that isn't.
    const plain = more.find((b) => b.payload.palette !== 'navygold') ?? state.backs.find((b) => b.payload.palette !== 'navygold')!;
    const tweaked = await tweakBack(erin, SEED_PROJECT_ID, plain.id, 'in navy and gold');
    expect(tweaked.option.payload.palette).toBe('navygold');

    // Both heart the jersey back.
    const jersey = state.backs.find((b) => b.payload.template === 'jersey')!;
    await react(erin, SEED_PROJECT_ID, jersey.id, 'love');
    await react(joel, SEED_PROJECT_ID, jersey.id, 'love');
    const front = state.options.find((o) => o.source === 'seed')!;
    await expect(approve(erin, SEED_PROJECT_ID, { optionId: jersey.id, garment: 'tee', color: 'white', preset: 'standard', sizes: [{ who: 'Erin', size: 'M', qty: 1 }] })).rejects.toThrow(/gone/);

    const decision = await approve(erin, SEED_PROJECT_ID, {
      optionId: front.id,
      backOptionId: jersey.id,
      garment: 'tee',
      color: 'navy',
      preset: 'standard',
      sizes: [
        { who: 'Erin', size: 'M', qty: 1 },
        { who: 'Joel', size: 'L', qty: 1 },
      ],
    });
    expect(decision.snapshot.back!.names).toEqual(['Erin', 'Joel']);
    expect(decision.snapshot.back!.design.pairing).toBe(SEED_DESIGN.pairing);

    const built = await buildPackage(decision.id);
    expect(built.error).toBeUndefined();
    const names = built.files!.map((f) => f.name);
    expect(names).toContain('print-file-back-ERIN-12x14.4in.png');
    expect(names).toContain('print-file-back-JOEL-12x14.4in.png');
    expect(names).toContain('back-vector.svg');

    const backPng = (await repo.getAsset(built.files!.find((f) => f.name.startsWith('print-file-back-ERIN'))!.key))!.data;
    const meta = await sharp(backPng).metadata();
    expect([meta.width, meta.height, meta.density, meta.hasAlpha]).toEqual([3600, 4320, 300, true]);

    const zip = unzipSync(new Uint8Array((await repo.getAsset(built.files![0].key))!.data));
    const readme = new TextDecoder().decode(Object.entries(zip).find(([k]) => k.endsWith('README.txt'))![1]);
    expect(readme).toContain('print-file-back-JOEL');
    expect(Object.keys(zip).some((k) => k.endsWith('shirt-preview-both-sides.png'))).toBe(true);
    const pdf = (await repo.getAsset(built.files!.find((f) => f.name === 'order-sheet.pdf')!.key))!.data;
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
  }, 180_000);

  it('gives older projects starter backs on first look', async () => {
    const { repo } = tempRepo();
    const t = new Date().toISOString();
    await repo.saveProject({ id: 'old', kind: 'shirt', title: 'Old', createdAt: t, updatedAt: t, status: 'exploring', brief: { copy: SEED_COPY, vibes: [], ticket: { from: '', to: '', date: '' }, copyIdeas: [] } });
    const first = await projectState('old', USERS.erin);
    expect(first.backs.length).toBeGreaterThan(0);
    const again = await projectState('old', USERS.erin);
    expect(again.backs.map((b) => b.id)).toEqual(first.backs.map((b) => b.id));
  });
});
