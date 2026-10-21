// New projects: occasion presets, creation, who approves, archiving, and backs
// that appear when the details allow them.
import { beforeAll, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { loadAllFonts } from '@/lib/server/fonts';
import { contextFor, factsFromBasics, motifsFor, OCCASION_PRESETS, ordinal, possessive, preset } from '@/lib/design/occasions';
import { MOTIF_NAMES, motifSvg } from '@/lib/design/motifs';
import { inksFor } from '@/lib/design/palettes';
import { renderDesign } from '@/lib/design/render';
import { addArtRequest, artIdeaExamples } from '@/lib/design/examples';
import { heuristicTweak } from '@/lib/design/tweak';
import { sampleFor, vibesFor } from '@/lib/design/vibes';
import type { FontSet, MotifId, ShirtDesign } from '@/lib/design/types';
import { USERS } from '@/lib/server/auth';
import { approve } from '@/lib/server/decisions';
import { slugify } from '@/lib/server/ids';
import { archiveProject } from '@/lib/server/archive';
import { cleanBasics, createProject, seatsFor } from '@/lib/server/projects';
import { contextOf, ensureSeed, projectState, remix, SEED_PROJECT_ID, updateBrief } from '@/lib/server/studio';

let fonts: FontSet;
beforeAll(async () => {
  fonts = await loadAllFonts();
});

const TROPICAL: MotifId[] = ['sunset-palm', 'palm-duo', 'bungalow-sunset', 'hourglass-island', 'sunset-clock'];
const artOf = (d: ShirtDesign) => (d.art.kind === 'motif' ? d.art.motif : null);

describe('occasion presets', () => {
  it('writes ordinals and possessives', () => {
    expect(['1', '2', '3', '4', '11', '12', '13', '21', '22', '31', '50', '101', '111'].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st', '50th', '101st', '111th',
    ]);
    expect(ordinal('X')).toBe('X');
    expect(possessive('Erin')).toBe("Erin's");
    expect(possessive('James')).toBe("James'");
  });

  it('suggests six word sets for every occasion, with the names filled in', () => {
    for (const p of OCCASION_PRESETS) {
      const ideas = p.copyIdeas(p.example);
      expect(ideas, p.id).toHaveLength(6);
      for (const c of ideas) {
        expect(c.headline.trim(), p.id).not.toBe('');
        expect(`${c.headline} ${c.tagline} ${c.extra}`, p.id).not.toMatch(/undefined|null|\$\{/);
      }
    }
    expect(preset('birthday').copyIdeas(preset('birthday').example)[0]).toEqual({ headline: "Maya's 40th", tagline: 'Aged to Perfection', extra: 'Jun 14, 2027' });
    // Even with almost nothing filled in.
    for (const p of OCCASION_PRESETS) {
      expect(p.copyIdeas({ title: 'Something', people: [], dates: '', number: '', year: '', place: '' }).length, p.id).toBeGreaterThan(0);
    }
  });

  it('builds back details from the basics without inventing anything', () => {
    const b = factsFromBasics('birthday', preset('birthday').example);
    expect(b).toMatchObject({ title: 'Maya’s 40th', people: ['Maya'], bigNumber: '40', year: '1987', yearLabel: 'Vintage', stops: [], timeline: [] });
    expect(b.stats.map((s) => s.label)).toEqual(['years', 'days', 'regrets']);
    expect(b.stats[1].value).toBe('14,610');
    const g = factsFromBasics('graduation', preset('graduation').example);
    expect(g).toMatchObject({ yearLabel: 'Class of', year: '2027', bigNumber: '27' });
    const t = factsFromBasics('trip', preset('trip').example);
    expect(t.place.name).toBe('Lisbon');
    expect(t.stops).toEqual([]);
    const a = factsFromBasics('anniversary', preset('anniversary').example);
    expect(a.timeline).toEqual([
      { year: '2017', label: 'I do' },
      { year: String(new Date().getFullYear()), label: '10 years in' },
    ]);
    expect(contextFor('birthday', preset('birthday').example)).toContain('a birthday: "Maya’s 40th"');
  });

  it('keeps palm trees for trips', () => {
    for (const o of ['birthday', 'graduation', 'anniversary', 'team', 'reunion', 'everyday'] as const) {
      for (const m of TROPICAL) expect(motifsFor([o]), o).not.toContain(m);
    }
    expect(motifsFor(['trip'])).toContain('palm-duo');
    expect(vibesFor(['birthday']).map((v) => v.id)).not.toContain('boarding');
    expect(vibesFor(['birthday']).map((v) => v.id)).toContain('party');
    expect(vibesFor(['trip', 'anniversary']).map((v) => v.id)).toContain('boarding');
  });

  it('draws every built-in artwork cleanly, solid and as line art', () => {
    for (const id of Object.keys(MOTIF_NAMES) as MotifId[]) {
      for (const tone of ['light', 'dark'] as const) {
        for (const line of [false, true]) {
          const svg = motifSvg(id, inksFor('sunset', { hex: tone === 'light' ? '#FFFFFF' : '#1E2740', tone }), { line });
          expect(svg, id).not.toMatch(/NaN|undefined|Infinity/);
          if (id !== 'none') expect(svg.length, id).toBeGreaterThan(100);
        }
      }
    }
  });

  it('understands the new artwork in plain English', () => {
    const base: ShirtDesign = { layout: 'stack', pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sunset' } };
    expect(artOf(heuristicTweak(base, 'add some balloons').design)).toBe('balloons');
    expect(artOf(heuristicTweak(base, 'a graduation cap please').design)).toBe('grad-cap');
    expect(artOf(heuristicTweak(base, 'champagne!').design)).toBe('champagne');
    expect(artOf(heuristicTweak(base, 'I love it, but bluer').design)).toBe('sunset');
  });
});

describe('new projects', () => {
  it('makes a project for every occasion that fits it', async () => {
    tempRepo();
    for (const p of OCCASION_PRESETS) {
      const project = await createProject(USERS.joel, { occasion: p.id, basics: p.example, copy: p.copyIdeas(p.example)[0], copyIdeas: p.copyIdeas(p.example) });
      const state = await projectState(project.id, USERS.joel);
      expect(state.options, p.id).toHaveLength(16);
      expect(state.options[0].payload.layout, p.id).toBe(p.sample.layout);
      const pool = motifsFor([p.id]);
      for (const o of state.options) {
        const m = artOf(o.payload);
        if (m) expect(pool, `${p.id}: ${m}`).toContain(m);
        if (p.id !== 'trip') expect(o.payload.layout, p.id).not.toBe('ticket');
        expect(o.payload.ticket, p.id).toBeTruthy();
      }
      for (const o of state.options.slice(0, 4)) {
        const svg = renderDesign(o.payload, { fonts, copy: state.project.brief.copy, tone: 'light', shirtHex: '#FFFFFF', assetHref: (k) => k });
        expect(svg, p.id).not.toMatch(/NaN|undefined/);
      }
      expect(state.backs.length, p.id).toBeGreaterThan(0);
      expect(state.facts.title).toBe(p.example.title);
      expect(state.project.brief.copyIdeas.length).toBeGreaterThan(1);
      expect(contextOf(state.project)).toContain(p.example.title);
      expect(state.canApprove).toBe(true);
      expect(state.approverName).toBe('Joel');
      expect((await projectState(project.id, USERS.erin)).canApprove).toBe(false);
    }
  });

  it('lets whoever started it approve it, and keeps whoever it was handed to', async () => {
    tempRepo();
    await ensureSeed();
    const p = preset('birthday');
    const project = await createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    const state = await projectState(project.id, USERS.joel);
    const input = { optionId: state.options[0].id, garment: 'tee' as const, color: 'white', preset: 'standard', sizes: [{ who: 'Erin', size: 'M', qty: 1 }] };
    await expect(approve(USERS.erin, project.id, input)).rejects.toThrow('Joel makes the final call');
    expect((await approve(USERS.joel, project.id, input)).approvedBy).toBe('joel');

    const sample = await projectState(SEED_PROJECT_ID, USERS.erin);
    expect(sample.canApprove).toBe(true);
    expect((await projectState(SEED_PROJECT_ID, USERS.joel)).approverName).toBe('Erin');
  });

  it('remixes inside the occasion', async () => {
    tempRepo();
    const p = preset('graduation');
    const project = await createProject(USERS.erin, { occasion: 'graduation', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    const more = await remix(USERS.erin, project.id, null, 12);
    for (const o of more) {
      const m = artOf(o.payload);
      if (m) expect(motifsFor(['graduation'])).toContain(m);
    }
  });

  it('adds the route backs once a route is filled in', async () => {
    tempRepo();
    const p = preset('trip');
    const project = await createProject(USERS.erin, { occasion: 'trip', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    let state = await projectState(project.id, USERS.erin);
    expect(state.backs.some((b) => b.payload.template === 'flight-path')).toBe(false);
    await updateBrief(project.id, {
      facts: {
        ...state.facts,
        stops: [
          { code: 'LAX', place: 'Los Angeles', region: 'CA', date: 'Jun 2', stay: false },
          { code: 'LIS', place: 'Lisbon', region: 'Portugal', date: 'Jun 3', stay: true },
          { code: 'LAX', place: 'Los Angeles', region: 'CA', date: 'Jun 9', stay: true },
        ],
      },
    });
    state = await projectState(project.id, USERS.erin);
    expect(state.backs.filter((b) => b.payload.template === 'flight-path')).toHaveLength(3);
    expect(state.backs.filter((b) => b.payload.template === 'tour-dates').length).toBeGreaterThan(0);
  });

  it('archives only for the person who started it (or Joel)', async () => {
    const { repo } = tempRepo();
    const p = preset('team');
    const project = await createProject(USERS.joel, { occasion: 'team', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    await expect(archiveProject(USERS.erin, project.id)).rejects.toThrow(/started it/);
    await archiveProject(USERS.joel, project.id);
    expect((await repo.getProject(project.id))!.archived).toBe(true);
  });

  it('checks what comes in', async () => {
    tempRepo();
    const copy = { headline: 'Hi', tagline: '', extra: '' };
    await expect(createProject(USERS.joel, { occasion: 'party' as never, basics: preset('trip').example, copy })).rejects.toThrow(/celebrating/);
    await expect(createProject(USERS.joel, { occasion: 'trip', basics: { ...preset('trip').example, title: '  ' }, copy })).rejects.toThrow(/name/);
    await expect(createProject(USERS.joel, { occasion: 'trip', basics: preset('trip').example, copy: { ...copy, headline: '' } })).rejects.toThrow(/words/);
    expect(cleanBasics({ title: ' x '.repeat(50), people: 'Erin, Joel ,, Sam' as never })).toMatchObject({ people: ['Erin', 'Joel', 'Sam'] });
    expect(slugify('Erin’s 50th!')).toBe('erins-50th');
    expect(slugify('Café Crawl Trip')).toBe('cafe-crawl-trip');
  });
});

describe('every project is its own', () => {
  const base: ShirtDesign = { layout: 'stack', pairing: 'bebas-pacifico', palette: 'sunset', art: { kind: 'motif', motif: 'sunset' } };

  it('suggests artwork that suits the occasion', () => {
    expect(addArtRequest(['graduation'])).toBe('Add a grad cap');
    expect(addArtRequest(['birthday'])).toBe('Add balloons');
    expect(addArtRequest(['trip', 'anniversary'])).toBe('Add a palm tree');
    for (const p of OCCASION_PRESETS) {
      // The quick button does what it says, with art from the project's own set.
      const pool = motifsFor([p.id]);
      const art = artOf(heuristicTweak(base, addArtRequest([p.id]), pool).design);
      expect(pool, `${p.id}: ${art}`).toContain(art);
      expect(artIdeaExamples([p.id])).toEqual(p.artIdeas.slice(0, 2));
    }
  });

  it('shows each vibe with artwork that fits, and leaves the trip and anniversary ones as they are', () => {
    for (const p of OCCASION_PRESETS) {
      for (const v of vibesFor([p.id])) {
        const s = sampleFor(v, [p.id]);
        if (s.art.kind === 'motif') expect(motifsFor([p.id]), `${p.id} / ${v.id}`).toContain(s.art.motif);
      }
    }
    for (const v of vibesFor(['trip', 'anniversary'])) expect(sampleFor(v, ['trip', 'anniversary'])).toEqual(v.sample);
  });

  it('only reads loose words as island art when it suits the project', () => {
    const grad = motifsFor(['graduation']);
    expect(artOf(heuristicTweak(base, 'make it about the couple', grad).design)).not.toBe('palm-duo');
    expect(artOf(heuristicTweak(base, 'something with sand', grad).design)).not.toBe('hourglass-island');
    expect(artOf(heuristicTweak(base, 'make it about the couple', motifsFor(['trip'])).design)).toBe('palm-duo');
    // Asking outright still works anywhere.
    expect(artOf(heuristicTweak(base, 'add a palm tree', grad).design)).toBe('sunset-palm');
  });

  it('gives everyone a seat on the boarding pass', async () => {
    expect([1, 2, 3, 4, 9].map(seatsFor)).toEqual(['1A', '1A 1B', '1A–1C', '1A–1D', '1A–1F']);
    tempRepo();
    const p = preset('trip');
    const project = await createProject(USERS.joel, { occasion: 'trip', basics: { ...p.example, people: ['Ana', 'Luis', 'Sam', 'Maya'] }, copy: p.copyIdeas(p.example)[0] });
    expect(project.brief.ticket.seats).toBe('1A–1D');
  });
});
