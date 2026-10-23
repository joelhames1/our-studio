// The UX pass before the dry run: where links lead back to, what tab a page
// belongs to, names suggested and kept, and the words on screen.
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { backHref, designHref, originOf, returnTo, safeNext, tabFor, upFrom } from '@/lib/engine/paths';
import { carriedReaction } from '@/lib/engine/together';
import { suggestedTitle } from '@/lib/design/occasions';
import { startingSizes } from '@/lib/kinds/shirt';
import { backTemplate, templateName } from '@/lib/design/back/templates';
import { proxy } from '@/proxy';

const base = '/p/sams-graduation-abc123';

describe('coming back after signing in', () => {
  it('takes the app’s own pages, with their query', () => {
    expect(safeNext('/p/sams-graduation-abc123')).toBe('/p/sams-graduation-abc123');
    expect(safeNext('/p/sams-graduation-abc123/o/t22zrjd4frd7?from=favorites')).toBe('/p/sams-graduation-abc123/o/t22zrjd4frd7?from=favorites');
    expect(safeNext('/household')).toBe('/household');
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('/admin/households')).toBe('/admin/households');
  });

  it('refuses anything that could leave the site or isn’t a page', () => {
    for (const bad of [
      '//evil.example/p/x',
      '/\\evil.example',
      'https://evil.example/p/x',
      'javascript:alert(1)',
      '/api/logout',
      '/p/x/../../api/logout',
      '/p/x?next=https://evil.example',
      '',
      '/'.repeat(400),
    ]) {
      expect(safeNext(bad), bad).toBeNull();
    }
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(['/household'])).toBeNull();
  });

  it('is told which page was asked for', () => {
    const res = proxy(new NextRequest('http://localhost:3000/p/abc/o/xyz?from=favorites'));
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/p/abc/o/xyz?from=favorites');
  });
});

describe('finding the way back from a design', () => {
  it('remembers only the screens it knows', () => {
    expect(originOf('favorites')).toBe('favorites');
    expect(originOf('compare')).toBe('compare');
    expect(originOf('elsewhere')).toBeNull();
    expect(originOf(null)).toBeNull();
    expect(designHref(base, 'd1', 'favorites')).toBe(`${base}/o/d1?from=favorites`);
    expect(designHref(base, 'd1')).toBe(`${base}/o/d1`);
    expect(backHref(base, 'b1', 'final')).toBe(`${base}/b/b1?from=final`);
  });

  it('names the way back after the screen it came from', () => {
    expect(returnTo(base, 'favorites', false)).toEqual({ href: `${base}/favorites`, label: 'Favorites', button: 'Back to favorites' });
    expect(returnTo(base, 'final', false).href).toBe(`${base}/approve`);
    expect(returnTo(base, 'final', true).href).toBe(`${base}/done`);
    expect(returnTo(base, null, false)).toEqual({ href: `${base}/browse`, label: 'Browse', button: 'Keep browsing' });
  });

  it('lights up the tab a design was opened from, not always Browse', () => {
    expect(tabFor(`${base}/o/d1`, base, 'favorites')).toBe('favorites');
    expect(tabFor(`${base}/o/d1`, base, 'compare')).toBe('favorites');
    expect(tabFor(`${base}/o/d1`, base, null)).toBe('browse');
    expect(tabFor(`${base}/b/b1`, base, null)).toBe('back');
    expect(tabFor(`${base}/b/b1`, base, 'favorites')).toBe('favorites');
    expect(tabFor(`${base}/vibe`, base, null)).toBe('browse');
    expect(tabFor(`${base}/done`, base, null)).toBe('final');
    // The project page and its words belong to no tab.
    expect(tabFor(base, base, null)).toBeNull();
    expect(tabFor(`${base}/words`, base, null)).toBeNull();
  });

  it('goes up one level from the corner arrow, not all the way home', () => {
    expect(upFrom(base, base, null, false)).toEqual({ href: '/', label: 'Home' });
    expect(upFrom(`${base}/favorites`, base, null, false).href).toBe(base);
    expect(upFrom(`${base}/o/d1`, base, 'favorites', false).href).toBe(`${base}/favorites`);
    expect(upFrom(`${base}/o/d1`, base, null, false).href).toBe(`${base}/browse`);
    expect(upFrom(`${base}/b/b1`, base, null, false).href).toBe(`${base}/back`);
    expect(upFrom(`${base}/o/d1`, base, 'final', true).href).toBe(`${base}/done`);
  });
});

describe('a new version of a favorite', () => {
  it('keeps your love or maybe, and nothing else', () => {
    expect(carriedReaction('love')).toBe('love');
    expect(carriedReaction('maybe')).toBe('maybe');
    expect(carriedReaction('pass')).toBeNull();
    expect(carriedReaction(undefined)).toBeNull();
  });
});

describe('starting a project', () => {
  const none = { people: [], number: '', place: '', dates: '' };
  it('suggests a name from what’s been filled in', () => {
    expect(suggestedTitle('graduation', { ...none, people: ['Sam'] })).toBe("Sam's Graduation");
    expect(suggestedTitle('birthday', { ...none, people: ['Maya'], number: '40' })).toBe("Maya's 40th");
    expect(suggestedTitle('birthday', { ...none, people: ['James'] })).toBe("James' Birthday");
    expect(suggestedTitle('anniversary', { ...none, number: '10' })).toBe('Our 10th');
    expect(suggestedTitle('trip', { ...none, place: 'Lisbon', dates: 'Jun 2 – 9, 2027' })).toBe('Lisbon 2027');
    expect(suggestedTitle('trip', { ...none, people: ['Sam', 'Alex'] })).toBe("Sam & Alex's Trip");
  });

  it('suggests nothing when there’s nothing to go on', () => {
    expect(suggestedTitle('graduation', none)).toBeNull();
    expect(suggestedTitle('team', { ...none, people: ['Sam'] })).toBeNull();
  });
});

describe('who gets a shirt', () => {
  it('starts with the people it’s about, then the household, once each', () => {
    expect(startingSizes(['Sam'], ['Priya', 'Dev', 'sam'], 'Priya').map((s) => s.who)).toEqual(['Sam', 'Priya', 'Dev']);
    expect(startingSizes([], [], 'Priya')).toEqual([{ who: 'Priya', size: 'M', qty: 1 }]);
    expect(startingSizes([], Array.from({ length: 20 }, (_, i) => `P${i}`), 'Me')).toHaveLength(12);
  });
});

describe('back names', () => {
  it('fit the occasion instead of showing the kit’s own name', () => {
    const year = backTemplate('established');
    expect(templateName(year, ['graduation'])).toBe('Class of');
    expect(templateName(year, ['anniversary'])).toBe('Established');
    expect(templateName(year, ['team'])).toBe('Year stamp');
    expect(templateName(backTemplate('statement'), ['graduation'])).toBe('Big words');
    expect(templateName(backTemplate('jersey'))).toBe('Name and number');
  });
});
