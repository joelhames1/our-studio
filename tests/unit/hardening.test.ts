// The last round of hardening: hidden characters in names, project ids that
// can't land on each other, print files that can't overwrite each other, an
// approval nobody can probe for, drawings that can't stall the server, fal
// downloads that stay on fal, and an outage that says so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn, tempRepo } from './helpers';
import { GET as asset } from '@/app/api/assets/[...key]/route';
import { POST as build } from '@/app/api/decisions/[id]/build/route';
import { preset } from '@/lib/design/occasions';
import { previewKey } from '@/lib/design/preview';
import { paintForTweak } from '@/lib/server/art';
import { makePreview } from '@/lib/server/preview';
import type { User } from '@/lib/engine/types';
import { USERS } from '@/lib/server/auth';
import { renameProject } from '@/lib/server/archive';
import { approve } from '@/lib/server/decisions';
import { backFileNames } from '@/lib/server/export/package';
import { cleanName, forgetDirectory, userById } from '@/lib/server/people';
import { oneLine } from '@/lib/server/plain';
import { aiTimings } from '@/lib/server/health';
import { DatabaseUnreachable } from '@/lib/server/repo';
import { sessionAlive } from '@/lib/server/sessions';
import { createProject } from '@/lib/server/projects';
import sharp from 'sharp';
import { download } from '@/lib/server/providers/fal';
import { MAX_SVG_ELEMENTS, sanitizeSvg } from '@/lib/server/providers/svg';
import type { LocalRepo } from '@/lib/server/repo/local';
import { projectState } from '@/lib/server/studio';

const jar = vi.hoisted(() => ({ value: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === 'studio_session' && jar.value ? { value: jar.value } : undefined) }) }));

const ENV = ['ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.ERIN_GOOGLE_EMAIL = 'erin@example.com';
  process.env.JOEL_GOOGLE_EMAIL = 'joel@example.com';
  // Email codes on, so sessions are signed with the server's own secret.
  process.env.RESEND_API_KEY = 're_test_not_real';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_not_real';
  jar.value = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const birthday = (user: User = USERS.joel, title?: string) => {
  const p = preset('birthday');
  return createProject(user, { occasion: 'birthday', basics: { ...p.example, ...(title === undefined ? {} : { title }) }, copy: p.copyIdeas(p.example)[0] });
};

/** The Riveras next door: Sam owns the household. */
async function riveras(repo: LocalRepo): Promise<User> {
  await userById('joel');
  const t = new Date().toISOString();
  await repo.saveHousehold({ id: 'riveras', name: 'The Riveras', createdAt: t, createdBy: 'sam' });
  await repo.savePerson({ id: 'sam', name: 'Sam', email: 'sam@example.com', createdAt: t });
  await repo.saveMembership({ householdId: 'riveras', personId: 'sam', role: 'owner', joinedAt: t });
  forgetDirectory();
  return (await userById('sam'))!;
}

describe('names and titles', () => {
  it('drop control characters and the marks that flip text around', () => {
    // U+202E would make "Sam\u202EnimdA" read as "SamAdmin".
    expect(oneLine('Sam\u202Enimd\u200FA', 40)).toBe('Sam nimd A');
    expect(oneLine('  Zoë\u0000\u0007 \n\t Rivera\u2066  ', 40)).toBe('Zoë Rivera');
    expect(oneLine({ toString: () => 'sneaky' }, 40)).toBe('');
    // Emoji that join with an invisible joiner stay whole.
    expect(oneLine('👩\u200D👩\u200D👧 family', 40)).toBe('👩\u200D👩\u200D👧 family');
    expect(cleanName('Sam\u202E'.repeat(30))).toMatch(/^(Sam ){9}Sam$/);
  });

  it('are cleaned on the way in, for new projects and renames', async () => {
    tempRepo();
    const project = await birthday(USERS.joel, 'Abuela\u202E’s 80th\u0000');
    expect(project.title).toBe('Abuela ’s 80th');
    await renameProject(USERS.joel, project.id, 'Lake\u2067 weekend');
    expect((await projectState(project.id, USERS.joel)).project.title).toBe('Lake weekend');
  });
});

describe('new projects', () => {
  it('never land on top of an existing one', async () => {
    const { repo } = tempRepo();
    const first = await birthday();
    expect(await repo.addProject({ ...first, title: 'Not this one' })).toBe(false);
    expect((await repo.getProject(first.id))!.title).toBe(first.title);

    // The id it picks is taken (as unlikely as that is): it picks another.
    const tried: string[] = [];
    const add = repo.addProject.bind(repo);
    vi.spyOn(repo, 'addProject').mockImplementation(async (p) => {
      tried.push(p.id);
      return tried.length > 1 && add(p);
    });
    const second = await birthday();
    expect(tried).toHaveLength(2);
    expect(tried[0]).not.toBe(tried[1]);
    expect(second.id).toBe(tried[1]);
    expect(second.id).toMatch(/-[a-z0-9]{8}$/);
  });
});

describe('back print files', () => {
  it('get a name each, even when two people’s names come out the same', () => {
    expect(backFileNames(['Erin', 'Joel'], '12x14.4in')).toEqual(['print-file-back-ERIN-12x14.4in.png', 'print-file-back-JOEL-12x14.4in.png']);
    expect(backFileNames(['Zoë', 'Zoe', 'zoe', 'Alex'], '12x14.4in')).toEqual([
      'print-file-back-ZOE-12x14.4in.png',
      'print-file-back-ZOE-2-12x14.4in.png',
      'print-file-back-ZOE-3-12x14.4in.png',
      'print-file-back-ALEX-12x14.4in.png',
    ]);
    expect(backFileNames([undefined], '12x14.4in')).toEqual(['print-file-back-12x14.4in.png']);
  });
});

describe('building print files', () => {
  it('asks for a sign-in first, and says the same for a missing approval as for someone else’s', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    const project = await birthday();
    const state = await projectState(project.id, USERS.joel);
    const decision = await approve(USERS.joel, project.id, { optionId: state.options[0].id, garment: 'tee', color: 'white', preset: 'standard', sizes: [{ who: 'Maya', size: 'M', qty: 1 }] });
    const post = async (id: string) => {
      const res = await build(new Request(`https://studio.example.com/api/decisions/${id}/build`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), {
        params: Promise.resolve({ id }),
      });
      return { status: res.status, body: await res.json() };
    };
    expect((await post(decision.id)).status).toBe(401);
    expect((await post('nothing-here')).status).toBe(401);
    jar.value = await signedIn(sam.id);
    const theirs = await post(decision.id);
    const missing = await post('nothing-here');
    expect(theirs).toEqual({ status: 404, body: { error: 'That approval is gone.' } });
    expect(missing).toEqual(theirs);
  });
});

describe('drawings from Claude', () => {
  it('can’t stall the server with broken tags', () => {
    const started = performance.now();
    for (const junk of ['<a' + ' '.repeat(390_000), '<a'.repeat(190_000), '<svg>' + '<path d'.repeat(48_000) + '</svg>', '<svg><path ' + 'a'.repeat(390_000) + '</svg>']) {
      try {
        sanitizeSvg(junk);
      } catch {
        // Refused is fine; slow isn't.
      }
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('refuses more shapes, or deeper nesting, than any shirt needs', () => {
    expect(() => sanitizeSvg(`<svg>${'<circle r="1"/>'.repeat(MAX_SVG_ELEMENTS)}</svg>`)).toThrow(/too detailed/);
    expect(sanitizeSvg(`<svg>${'<circle r="1"/>'.repeat(100)}</svg>`)).toContain('<circle r="1"/>');
    expect(() => sanitizeSvg(`<svg>${'<g>'.repeat(40)}<path d="M0 0"/>${'</g>'.repeat(40)}</svg>`)).toThrow(/too detailed/);
    expect(sanitizeSvg(`<svg>${'<g>'.repeat(5)}<path d="M0 0"/>${'</g>'.repeat(5)}</svg>`)).toContain('<path d="M0 0"/>');
  });
});

describe('fal downloads', () => {
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const serve = (routes: Record<string, () => Response>) => {
    const asked: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      asked.push(url);
      expect(init?.redirect).toBe('manual');
      const route = routes[url];
      return route ? route() : new Response('nope', { status: 404 });
    });
    return asked;
  };

  it('follow a redirect only to fal’s own hosts', async () => {
    const asked = serve({
      'https://v3.fal.media/a.png': () => new Response(null, { status: 302, headers: { location: 'https://cdn.fal.media/a.png' } }),
      'https://cdn.fal.media/a.png': () => new Response(PNG),
      'https://v3.fal.media/b.png': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
      'https://v3.fal.media/c.png': () => new Response(null, { status: 301, headers: { location: '/c.png' } }),
    });
    expect(new Uint8Array(await download('https://v3.fal.media/a.png'))).toEqual(PNG);
    await expect(download('https://v3.fal.media/b.png')).rejects.toThrow(/unexpected place \(169\.254\.169\.254\)/);
    await expect(download('https://v3.fal.media/c.png')).rejects.toThrow(/kept redirecting/);
    expect(asked).not.toContain('http://169.254.169.254/latest/meta-data');
  });

  it('give up on an image that’s too big, whatever its headers say', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    serve({
      'https://v3.fal.media/huge.png': () =>
        new Response(
          new ReadableStream({
            pull(c) {
              sent++;
              if (sent > 100) c.close();
              else c.enqueue(chunk);
            },
          }),
        ),
    });
    await expect(download('https://v3.fal.media/huge.png')).rejects.toThrow(/too big/);
    // It stopped reading soon after the limit, not at the end.
    expect(sent).toBeLessThan(50);
  });
});

describe('a database outage', () => {
  it('says so, rather than looking like being signed out', async () => {
    const { repo } = tempRepo();
    const spy = vi.spyOn(repo, 'getSession');
    spy.mockRejectedValueOnce(new DatabaseUnreachable('Couldn’t reach Supabase'));
    await expect(sessionAlive('outage-sid', 'joel')).rejects.toBeInstanceOf(DatabaseUnreachable);
    // Any other trouble reading the list still counts as not signed in, for now.
    spy.mockRejectedValueOnce(new Error('something odd'));
    await expect(sessionAlive('odd-sid', 'joel')).resolves.toBe(false);
  });
});

describe('a project page', () => {
  it('asks for the designs and hearts alongside the project, and shows them only to its household', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    const project = await birthday();
    const order: string[] = [];
    const getProject = repo.getProject.bind(repo);
    vi.spyOn(repo, 'getProject').mockImplementation(async (id) => {
      order.push('project asked');
      await new Promise((r) => setTimeout(r, 50));
      order.push('project back');
      return getProject(id);
    });
    const listOptions = repo.listOptions.bind(repo);
    vi.spyOn(repo, 'listOptions').mockImplementation(async (id) => {
      order.push('designs asked');
      return listOptions(id);
    });
    expect((await projectState(project.id, USERS.joel)).options.length).toBeGreaterThan(0);
    expect(order.indexOf('designs asked')).toBeLessThan(order.indexOf('project back'));
    await expect(projectState(project.id, sam)).rejects.toMatchObject({ status: 404 });
  });
});

describe('AI call timings', () => {
  it('give the typical and slowest time for each kind of call that finished', () => {
    const at = new Date().toISOString();
    const call = (note: string, ms?: number) => ({ id: note + ms, at, provider: 'anthropic', model: 'm', usd: 0.01, note, ms });
    const timings = aiTimings([
      call('design tweak', 4000),
      call('design tweak', 6000),
      call('design tweak', 30_000),
      call('design tweak (in progress)', 1),
      call('design tweak'),
      call('artwork: a dog', 50_000),
      call('word ideas (cut off)', 75_000),
    ]);
    expect(timings).toEqual([
      { label: 'Change something (reading the request)', count: 3, typicalMs: 6000, slowestMs: 30_000, targetMs: 20_000 },
      { label: 'Word ideas', count: 1, typicalMs: 75_000, slowestMs: 75_000, targetMs: 25_000 },
      { label: 'A painting', count: 1, typicalMs: 50_000, slowestMs: 50_000, targetMs: 90_000 },
    ]);
  });
});

describe('artwork previews', () => {
  it('are kept beside each painting, served small for a day, and made on first look for older ones', async () => {
    const { repo } = tempRepo();
    const sam = await riveras(repo);
    const project = await birthday();
    const art = await paintForTweak(project.id, 'a kite', 'lagoon', [], undefined, Date.now() + 60_000);
    expect(art).toMatchObject({ kind: 'image' });
    const key = (art as { assetKey: string }).assetKey;
    const small = (await repo.getAsset(previewKey(key)))!;
    const meta = await sharp(small.data).metadata();
    expect([meta.format, meta.width! <= 768, meta.hasAlpha]).toEqual(['webp', true, true]);
    // On something like a real painting (soft shading, a little grain) it's a small fraction of the original.
    const painting = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs><radialGradient id="g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffd166"/><stop offset="0.5" stop-color="#f2654e"/><stop offset="1" stop-color="#12355b"/></radialGradient><filter id="n"><feTurbulence baseFrequency="0.9" numOctaves="2"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.25 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs><ellipse cx="512" cy="760" rx="440" ry="620" fill="url(#g)"/><ellipse cx="512" cy="760" rx="440" ry="620" filter="url(#n)"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    expect((await makePreview(painting)).length).toBeLessThan(painting.length / 20);

    // Artwork from before previews: the first look makes one.
    await repo.deleteAssets([previewKey(key)]);
    const get = async (who: string) => {
      jar.value = await signedIn(who);
      return asset(new Request(`https://studio.example.com/api/assets/${previewKey(key)}`), { params: Promise.resolve({ key: previewKey(key).split('/') }) });
    };
    const res = await get('joel');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(await repo.getAsset(previewKey(key))).not.toBeNull();
    // Still only for the household it belongs to.
    expect((await get(sam.id)).status).toBe(404);
  });
});
