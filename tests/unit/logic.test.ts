import { describe, expect, it } from 'vitest';
import { designKey, generateFresh, generateSimilar, seeded } from '@/lib/design/generate';
import { heuristicTweak } from '@/lib/design/tweak';
import { SEED_DESIGN } from '@/lib/design/seed';
import { sanitizeSvg } from '@/lib/server/providers/svg';
import { helloIn } from '@/lib/engine/greeting';

describe('generator', () => {
  it('makes unique designs, reproducibly', () => {
    const a = generateFresh({ vibes: [], count: 20, rand: seeded(7) });
    const b = generateFresh({ vibes: [], count: 20, rand: seeded(7) });
    expect(a).toEqual(b);
    expect(new Set(a.map(designKey)).size).toBe(20);
  });
  it('stays inside the chosen vibe', () => {
    const designs = generateFresh({ vibes: ['boarding'], count: 5, rand: seeded(1) });
    expect(designs.every((d) => d.layout === 'ticket')).toBe(true);
  });
  it('"more like this" changes something but keeps a family resemblance', () => {
    const similar = generateSimilar(SEED_DESIGN, { count: 4, rand: seeded(3) });
    expect(similar).toHaveLength(4);
    for (const d of similar) {
      expect(designKey(d)).not.toBe(designKey(SEED_DESIGN));
      const same = ['layout', 'pairing', 'palette'].filter((k) => d[k as 'layout'] === SEED_DESIGN[k as 'layout']).length;
      expect(same).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('keyword tweaks', () => {
  it('understands size and color together', () => {
    const r = heuristicTweak(SEED_DESIGN, 'bigger words and more blue');
    expect(r.design.headlineScale).toBeCloseTo(1.15);
    expect(r.design.palette).toBe('lagoon');
    expect(r.changes.length).toBe(2);
  });
  it('understands the tagline specifically', () => {
    const r = heuristicTweak(SEED_DESIGN, 'make the tagline smaller');
    expect(r.design.taglineScale).toBeLessThan(1);
    expect(r.design.headlineScale).toBeUndefined();
  });
  it('swaps artwork', () => {
    const r = heuristicTweak(SEED_DESIGN, 'add a palm tree');
    expect(r.design.art).toEqual({ kind: 'motif', motif: 'sunset-palm', line: undefined });
  });
  it('can drop the artwork', () => {
    expect(heuristicTweak(SEED_DESIGN, 'just the words please').design.art).toEqual({ kind: 'none' });
  });
  it('admits when it does not understand', () => {
    expect(heuristicTweak(SEED_DESIGN, 'qwerty zxcv').changes).toEqual([]);
  });
});

describe('sanitizeSvg', () => {
  it('keeps shapes and drops anything risky', () => {
    const dirty = `<?xml version="1.0"?><svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script>
      <g transform="translate(1 1)"><path d="M0 0L10 10" fill="#ff0000" onclick="x()"/><text>hi</text>
      <image href="https://evil.example/x.png"/><rect x="1" y="1" width="2" height="2" fill="url(#g)"/></g></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1000">/);
    expect(clean).toContain('<path d="M0 0L10 10" fill="#ff0000"/>');
    expect(clean).not.toMatch(/script|onload|onclick|<text|<image|url\(|evil/);
    expect(clean.endsWith('</svg>')).toBe(true);
  });
  it('rejects non-SVG', () => {
    expect(() => sanitizeSvg('hello')).toThrow();
  });
});

describe('home greeting', () => {
  it('goes by the reader’s time zone, not the server’s', () => {
    // 16:00 UTC is 9am in Los Angeles and 4pm in London.
    const at = new Date('2026-10-18T16:00:00Z');
    expect(helloIn('America/Los_Angeles', at)).toBe('Good morning');
    expect(helloIn('Europe/London', at)).toBe('Good afternoon');
    expect(helloIn('Asia/Tokyo', at)).toBe('Good morning'); // 1am: still morning
    expect(helloIn('Pacific/Honolulu', at)).toBe('Good morning');
    expect(helloIn('America/New_York', new Date('2026-10-18T23:30:00Z'))).toBe('Good evening');
  });
  it('says plain hello without a usable time zone', () => {
    expect(helloIn(undefined)).toBe('Hello');
    expect(helloIn('Mars/Olympus_Mons')).toBe('Hello');
    expect(helloIn('"><script>')).toBe('Hello');
  });
});
