// The printer finder: the package check, cleaning what the web says, the web
// search loop (against a stand-in for the Claude API), the shared list, and
// printer links.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { preset } from '@/lib/design/occasions';
import type { Decision } from '@/lib/engine/types';
import { fitCheck, minimumOf, printerMessage, type Printer, type PrintJob } from '@/lib/kinds/printers';
import type { ShirtSnapshot } from '@/lib/kinds/shirt';
import { USERS } from '@/lib/server/auth';
import { agree } from '@/lib/server/consent';
import { approve, reopen } from '@/lib/server/decisions';
import { claudeProblem, research } from '@/lib/server/llm/claude';
import type { FoundPrinter } from '@/lib/server/llm/tasks';
import { cleanFound, cleanZip, createShare, findPrinters, listPrinters, openShare, printerId, printerState, removePrinter, revokeShares, updatePrinter } from '@/lib/server/printers';
import { setRepo } from '@/lib/server/repo';
import type { Repo } from '@/lib/server/repo/types';
import { createProject } from '@/lib/server/projects';
import { spentThisMonth } from '@/lib/server/spend';
import { projectState } from '@/lib/server/studio';

const job: PrintJob = {
  title: 'Maya’s 40th',
  quantity: 2,
  garment: 'T-shirt',
  color: 'Navy',
  dark: true,
  sizes: 'M ×1, L ×1',
  printSize: '12 × 14.4 in',
  frontInks: 3,
  fullColorArt: false,
  backInks: 2,
  names: 2,
  notes: '',
};

const printer = (over: Partial<Printer> = {}): Printer => ({
  id: 'p-example-com',
  name: 'Example Prints',
  kind: 'local',
  website: 'https://example.com/',
  phone: null,
  email: null,
  address: null,
  area: 'Springfield',
  methods: [],
  ownShirts: 'unknown',
  minimum: null,
  turnaround: null,
  pricing: null,
  fileRequirements: null,
  howToSend: null,
  notes: null,
  sources: [],
  checkedAt: '2026-10-17T00:00:00.000Z',
  searches: { '90210': '2026-10-17T00:00:00.000Z' },
  status: 'found',
  ...over,
});

const levels = (p: Printer, j = job) => fitCheck(p, j).map((n) => `${n.level}: ${n.text}`);

describe('the package check', () => {
  it('reads minimums the way shops write them', () => {
    expect(minimumOf('No minimum')).toBe(1);
    expect(minimumOf('no min!')).toBe(1);
    expect(minimumOf('12 piece minimum')).toBe(12);
    expect(minimumOf('Minimum order: 24 shirts')).toBe(24);
    expect(minimumOf(null)).toBeNull();
    expect(minimumOf('Call us')).toBeNull();
  });

  it('flags what matters for this order', () => {
    const screenOnly = levels(printer({ methods: ['screen'], minimum: '12 pieces', ownShirts: 'no' }));
    expect(screenOnly).toContainEqual(expect.stringMatching(/^info: Screen printing is priced per color: this design uses 3 ink colors on the front and 2 on the back/));
    expect(screenOnly).toContainEqual(expect.stringMatching(/^warn: Each shirt has its own name/));
    expect(screenOnly).toContainEqual('warn: Their minimum is 12 shirts; you’re ordering 2.');
    expect(screenOnly).toContainEqual(expect.stringMatching(/^info: Uses their own blank shirts/));

    const dtg = levels(printer({ methods: ['dtg', 'screen'], minimum: 'No minimum', ownShirts: 'yes' }));
    expect(dtg).toContainEqual(expect.stringMatching(/^ok: Prints straight from the 300 DPI files/));
    expect(dtg).toContainEqual('ok: Their minimum (1) is fine for your 2.');
    expect(dtg).toContainEqual('ok: Will print on shirts you bring.');
    expect(dtg.some((n) => n.includes('own name'))).toBe(false);

    expect(levels(printer({ methods: ['embroidery'] }))).toContainEqual(expect.stringMatching(/^warn: Embroidery needs a stitch file/));
    expect(levels(printer({ methods: ['sublimation'] }))).toContainEqual('warn: Sublimation only works on white or light polyester shirts. Yours is dark.');
    expect(levels(printer({ methods: ['screen'] }), { ...job, fullColorArt: true, names: 0 })).toContainEqual(expect.stringMatching(/^warn: The artwork is a full-color painting/));
    expect(levels(printer())).toContainEqual(expect.stringMatching(/^info: Their pages don’t say how they print/));
  });

  it('writes a message with the link', () => {
    const m = printerMessage(job, 'https://studio.example/s/abc', 'October 31', 'Joel', { name: 'Example Prints' });
    expect(m.subject).toBe('T-shirt order: Maya’s 40th');
    expect(m.body).toContain('Hi Example Prints,');
    expect(m.body).toContain('2 t-shirts printed in navy (M ×1, L ×1)');
    expect(m.body).toContain('each shirt has its own name on the back');
    expect(m.body).toContain('https://studio.example/s/abc');
    expect(m.body.trim().endsWith('Joel')).toBe(true);
  });
});

describe('what the web says', () => {
  const found = (over: Partial<FoundPrinter> = {}): FoundPrinter => ({
    name: '  Ink & Thread  ',
    kind: 'local',
    website: 'https://www.inkandthread.example/contact',
    phone: '(555) 010-0199 <script>',
    email: 'orders@inkandthread.example',
    address: '1 Main St, Springfield',
    area: null,
    methods: ['screen', 'dtg', 'teleportation'],
    ownShirts: 'maybe',
    minimum: 'No minimum',
    turnaround: null,
    pricing: null,
    fileRequirements: 'Vector or 300 DPI PNG',
    howToSend: 'Email',
    notes: null,
    sources: ['https://www.inkandthread.example/faq', 'javascript:alert(1)', 'not a url', 'ftp://files.example/x'],
    ...over,
  });

  it('keeps only safe links and known values', () => {
    const p = cleanFound(found(), '90210', '2026-10-17T00:00:00.000Z')!;
    expect(p).toMatchObject({
      id: 'p-inkandthread-example',
      name: 'Ink & Thread',
      website: 'https://www.inkandthread.example/contact',
      phone: '(555) 010-0199',
      email: 'orders@inkandthread.example',
      methods: ['screen', 'dtg'],
      ownShirts: 'unknown',
      sources: ['https://www.inkandthread.example/faq'],
      status: 'found',
      searches: { '90210': '2026-10-17T00:00:00.000Z' },
    });
    const bad = cleanFound(found({ website: 'javascript:alert(1)', email: 'not an email', name: 'Plain Name' }), '90210', '')!;
    expect(bad.website).toBeNull();
    expect(bad.email).toBeNull();
    expect(bad.id).toBe('p-plain-name');
    expect(cleanFound(found({ name: '   ' }), '90210', '')).toBeNull();
  });

  it('tells apart shops that share a platform, and knows a shop again', () => {
    expect(printerId('Joe’s Prints', 'https://www.facebook.com/joesprints')).toBe('p-facebook-com-joes-prints');
    expect(printerId('Ink Lab', 'https://m.facebook.com/inklab')).toBe('p-m-facebook-com-ink-lab');
    expect(printerId('Ink Lab', 'https://www.yelp.com/biz/ink-lab-springfield')).toBe('p-yelp-com-ink-lab');
    expect(printerId('Ink Lab Printing', 'https://inklab.example/')).toBe(printerId('Ink Lab', 'https://www.inklab.example/about'));
  });

  it('checks ZIP codes', () => {
    expect(cleanZip(' 90210 ')).toBe('90210');
    expect(cleanZip('sw1a 1aa')).toBe('SW1A 1AA');
    for (const bad of ['', 'x', '<script>', '123456789012', 90210]) expect(() => cleanZip(bad), String(bad)).toThrow(/ZIP/);
  });
});

// A stand-in for the Claude API: one paused search turn, then the hand-back.
const requests: { body: Record<string, unknown>; beta: string | undefined }[] = [];
/** Replies in order; a function runs while the "search" is underway, then replies. */
let script: (object | (() => Promise<object>))[] = [];
let server: http.Server;

const reply = (content: object[], stop: string) => ({
  id: `msg_${requests.length}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 10_000, output_tokens: 1_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } },
});

const FOUND = [
  {
    name: 'Springfield Screen Co',
    kind: 'local',
    website: 'https://springfieldscreen.example',
    phone: '555-0100',
    email: 'hello@springfieldscreen.example',
    address: '12 Elm St, Springfield',
    area: 'Springfield',
    methods: ['screen', 'dtf'],
    ownShirts: 'yes',
    minimum: '6 shirts',
    turnaround: '7-10 days',
    pricing: null,
    fileRequirements: 'Vector preferred',
    howToSend: 'Email the artwork',
    notes: null,
    sources: ['https://springfieldscreen.example/faq'],
  },
  {
    name: 'ShipShirts',
    kind: 'online',
    website: 'https://shipshirts.example',
    phone: null,
    email: null,
    address: null,
    area: 'Ships across the US',
    methods: ['dtg'],
    ownShirts: 'no',
    minimum: 'No minimum',
    turnaround: '3 days',
    pricing: 'From $18 a shirt',
    fileRequirements: 'PNG, 300 DPI',
    howToSend: 'Upload when you order',
    notes: null,
    sources: ['https://shipshirts.example/pricing'],
  },
];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      requests.push({ body: JSON.parse(raw || '{}'), beta: req.headers['anthropic-beta'] as string | undefined });
      res.setHeader('Content-Type', 'application/json');
      const step = script.shift() ?? reply([{ type: 'text', text: 'Nothing more.' }], 'end_turn');
      const next = (typeof step === 'function' ? await step() : step) as { status?: number; body?: object };
      if (next.status) res.statusCode = next.status;
      res.end(JSON.stringify(next.body ?? next));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
});
afterAll(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  return new Promise<void>((r) => server.close(() => r()));
});

async function approvedBirthday(sizes = [{ who: 'Maya', size: 'M', qty: 1 }]) {
  // Searching sends the order to Claude, which whoever searches has to have agreed to.
  await agree(USERS.joel);
  await agree(USERS.erin);
  const p = preset('birthday');
  const project = await createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
  const state = await projectState(project.id, USERS.joel);
  const decision = await approve(USERS.joel, project.id, { optionId: state.options[0].id, garment: 'tee', color: 'navy', preset: 'standard', sizes });
  return { project, decision };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const found = (printers: object[]) => reply([{ type: 'tool_use', id: `toolu_${requests.length}`, name: 'record_printers', input: { printers } }], 'tool_use');
const NEW_SHOP = { ...FOUND[0], name: 'Fresh Ink', website: 'https://freshink.example', sources: [] };

/** Pretends every search happened `ms` earlier. */
async function age(repo: Repo, ms: number) {
  const back = (iso: string) => new Date(Date.parse(iso) - ms).toISOString();
  await repo.savePrinters((await listPrinters('first')).map((p) => ({ ...p, searches: Object.fromEntries(Object.entries(p.searches).map(([z, at]) => [z, back(at)])) })));
}

describe('finding printers', () => {
  it('searches, pauses and resumes, records the list, and settles the real cost', async () => {
    const { repo } = tempRepo();
    const { project } = await approvedBirthday([
      { who: 'Maya', size: 'M', qty: 1 },
      { who: 'Sam', size: 'L', qty: 2 },
    ]);
    requests.length = 0;
    script = [
      reply(
        [
          { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 't-shirt printing near 90210' } },
          { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
        ],
        'pause_turn',
      ),
      reply([{ type: 'tool_use', id: 'toolu_1', name: 'record_printers', input: { printers: FOUND } }], 'tool_use'),
    ];
    const out = await findPrinters(USERS.erin, project.id, '90210');

    expect(requests).toHaveLength(2);
    const first = requests[0];
    expect(first.beta).toContain('server-side-fallback-2026-07-01');
    const tools = first.body.tools as { type?: string; name: string; max_uses?: number; strict?: boolean }[];
    expect(tools.find((t) => t.name === 'web_search')).toMatchObject({ type: 'web_search_20260209', max_uses: 8 });
    expect(tools.find((t) => t.name === 'web_fetch')).toMatchObject({ type: 'web_fetch_20260209' });
    expect(tools.find((t) => t.name === 'record_printers')).toMatchObject({ strict: true });
    expect(JSON.stringify(first.body.messages)).toContain('90210');
    expect(JSON.stringify(first.body.messages)).toContain('3 t-shirts, navy');
    // The paused turn goes back as it was, with no extra message.
    const resumed = requests[1].body.messages as { role: string }[];
    expect(resumed.map((m) => m.role)).toEqual(['user', 'assistant']);

    expect(out.zip).toBe('90210');
    expect(out.job).toMatchObject({ quantity: 3, color: 'Navy', dark: true, sizes: 'M ×1, L ×2', backInks: null });
    expect(out.printers.map((p) => p.name).sort()).toEqual(['ShipShirts', 'Springfield Screen Co']);
    // Two turns: tokens at Opus 5.5 rates plus a cent a search.
    expect(await spentThisMonth()).toBe(0.16);
    expect((await repo.getProject(project.id))!.brief).toMatchObject({ printZip: '90210' });

    // Shortlist one, note it, refresh later: the shortlist survives.
    const local = out.printers.find((p) => p.kind === 'local')!;
    await updatePrinter('first', local.id, { status: 'saved', note: 'Ask about rush' });
    await age(repo, HOUR);
    script = [reply([{ type: 'tool_use', id: 'toolu_2', name: 'record_printers', input: { printers: FOUND } }], 'tool_use')];
    const again = await findPrinters(USERS.joel, project.id, '90210', true);
    expect(again.searched).toBe(true);
    expect(again.printers.find((p) => p.id === local.id)).toMatchObject({ status: 'saved', note: 'Ask about rush' });
    await expect(updatePrinter('first', local.id, { status: 'best' })).rejects.toMatchObject({ status: 400 });
    await removePrinter('first', again.printers.find((p) => p.kind === 'online')!.id);
    expect((await printerState(project.id)).printers).toHaveLength(1);
  });

  it('asks once more if Claude stops without handing the list back, and refuses before approval', async () => {
    tempRepo();
    const { project } = await approvedBirthday();
    requests.length = 0;
    script = [
      reply([{ type: 'text', text: 'Here are some printers…' }], 'end_turn'),
      reply([{ type: 'tool_use', id: 'toolu_3', name: 'record_printers', input: { printers: FOUND.slice(0, 1) } }], 'tool_use'),
    ];
    const out = await findPrinters(USERS.joel, project.id, '10001');
    expect(out.printers).toHaveLength(1);
    expect(JSON.stringify(requests[1].body.messages)).toContain('Now call record_printers');

    script = [reply([{ type: 'tool_use', id: 'toolu_4', name: 'record_printers', input: { printers: [] } }], 'tool_use')];
    await expect(findPrinters(USERS.joel, project.id, '10002')).rejects.toMatchObject({ status: 502 });

    const p = preset('birthday');
    const draft = await createProject(USERS.joel, { occasion: 'birthday', basics: p.example, copy: p.copyIdeas(p.example)[0] });
    await expect(findPrinters(USERS.joel, draft.id, '10001')).rejects.toMatchObject({ status: 409 });
  });

  it('keeps one record per shop, even when two share a Facebook page domain or one is listed twice', async () => {
    tempRepo();
    const { project } = await approvedBirthday();
    const facebook = (name: string, page: string) => ({ ...FOUND[0], name, website: `https://www.facebook.com/${page}`, sources: [] });
    script = [
      reply(
        [{ type: 'tool_use', id: 'toolu_5', name: 'record_printers', input: { printers: [...FOUND, FOUND[0], facebook('Joe’s Prints', 'joes'), facebook('Ink Lab', 'inklab')] } }],
        'tool_use',
      ),
    ];
    const out = await findPrinters(USERS.joel, project.id, '90211');
    const ids = out.printers.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(out.printers.map((p) => p.name).sort()).toEqual(['Ink Lab', 'Joe’s Prints', 'ShipShirts', 'Springfield Screen Co']);
  });

  it('says what Claude said when the API refuses, and doesn’t retry a search', async () => {
    tempRepo();
    const { project } = await approvedBirthday();
    const apiError = (status: number, message: string) => ({ status, body: { type: 'error', error: { type: 'invalid_request_error', message } } });

    requests.length = 0;
    script = [apiError(400, 'Web search is not enabled for this organization.')];
    let err = await findPrinters(USERS.joel, project.id, '90211').catch((e) => e);
    expect(claudeProblem(err)).toBe('Claude said: Web search is not enabled for this organization.');

    requests.length = 0;
    script = [apiError(500, 'Internal server error')];
    err = await findPrinters(USERS.joel, project.id, '90211').catch((e) => e);
    expect(requests).toHaveLength(1);
    expect(claudeProblem(err)).toMatch(/Claude said: Internal server error/);

    script = [apiError(401, 'invalid x-api-key')];
    err = await findPrinters(USERS.joel, project.id, '90211').catch((e) => e);
    expect(claudeProblem(err)).toMatch(/didn’t accept the API key/);
    script = [{ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: CLAUDE-OPUS-5-6' } } }];
    err = await findPrinters(USERS.joel, project.id, '90211').catch((e) => e);
    expect(claudeProblem(err)).toMatch(/doesn’t know a model called “CLAUDE-OPUS-5-6”.*ANTHROPIC_MODEL/);
    expect(claudeProblem(new Error('a bug of ours'))).toBeNull();
    // Nothing was charged for the failed searches beyond what Claude reported.
    expect(await spentThisMonth()).toBe(0);
  });

  it('takes the model name however it was typed', async () => {
    tempRepo();
    const { project } = await approvedBirthday();
    process.env.ANTHROPIC_MODEL = ' "CLAUDE-OPUS-5-5" ';
    try {
      requests.length = 0;
      script = [reply([{ type: 'tool_use', id: 'toolu_6', name: 'record_printers', input: { printers: FOUND } }], 'tool_use')];
      await findPrinters(USERS.joel, project.id, '90211');
      expect(requests[0].body.model).toBe('claude-opus-5-5');
    } finally {
      delete process.env.ANTHROPIC_MODEL;
    }
  });

  it('reuses a month of results, refreshes when asked, and drops what a refresh no longer finds', async () => {
    const { repo } = tempRepo();
    // Seven searches in a few milliseconds: the hourly search limit isn't what this is about.
    setRepo(Object.create(repo, { hit: { value: async () => null } }));
    const { project } = await approvedBirthday();
    requests.length = 0;
    script = [found(FOUND)];
    const first = await findPrinters(USERS.joel, project.id, '90211');
    expect(first.searched).toBe(true);
    expect(first.printers.map((p) => p.searches['90211'])).toEqual([expect.any(String), expect.any(String)]);
    const spent = await spentThisMonth();

    // The same ZIP code again: no search, no cost. A refresh straight away doesn't search either.
    expect((await findPrinters(USERS.erin, project.id, ' 90211 ')).searched).toBe(false);
    expect((await findPrinters(USERS.erin, project.id, '90211', true)).searched).toBe(false);
    expect(requests).toHaveLength(1);
    expect(await spentThisMonth()).toBe(spent);

    // Keep the local shop. A refresh an hour later finds a new shop and not the online one.
    const local = first.printers.find((p) => p.kind === 'local')!;
    await updatePrinter('first', local.id, { status: 'saved' });
    await age(repo, HOUR);
    script = [found([NEW_SHOP])];
    const refreshed = await findPrinters(USERS.joel, project.id, '90211', true);
    expect(refreshed.searched).toBe(true);
    expect(refreshed.printers.map((p) => p.name).sort()).toEqual(['Fresh Ink', 'Springfield Screen Co']);
    expect(refreshed.printers.find((p) => p.id === local.id)).toMatchObject({ status: 'saved' });

    // Erin saves a shop while a refresh is running and it doesn't come back: it stays, saved.
    await age(repo, HOUR);
    const fresh = refreshed.printers.find((p) => p.name === 'Fresh Ink')!;
    script = [
      async () => {
        await updatePrinter('first', fresh.id, { status: 'saved', note: 'Erin likes them' });
        return found([FOUND[0]]);
      },
    ];
    const during = await findPrinters(USERS.joel, project.id, '90211', true);
    expect(during.printers.find((p) => p.id === fresh.id)).toMatchObject({ status: 'saved', note: 'Erin likes them' });

    // A month on, the same ZIP code searches again by itself.
    await age(repo, 31 * DAY);
    script = [found([NEW_SHOP])];
    expect((await findPrinters(USERS.joel, project.id, '90211')).searched).toBe(true);
    expect(requests).toHaveLength(4);

    // An online service found from two ZIP codes stays until neither finds it.
    script = [found([FOUND[1]])];
    await findPrinters(USERS.joel, project.id, '10001');
    await age(repo, HOUR);
    script = [found([NEW_SHOP, FOUND[1]])];
    await findPrinters(USERS.joel, project.id, '90211', true);
    script = [found([NEW_SHOP])];
    const online = (await findPrinters(USERS.joel, project.id, '10001', true)).printers.find((p) => p.name === 'ShipShirts')!;
    expect(Object.keys(online.searches)).toEqual(['90211']);

    // A new project starts on the last ZIP code searched, with its results already there.
    const { project: next } = await approvedBirthday();
    const state = await printerState(next.id);
    expect(state.zip).toBe('10001');
    expect(state.printers.some((p) => p.searches['10001'])).toBe(true);
  });

  it('reads printers saved before searches were tracked per ZIP code', async () => {
    const { repo } = tempRepo();
    const { searches: _, ...legacy } = printer();
    await repo.savePrinters([{ ...legacy, zip: '90210' } as unknown as Printer]);
    const [old] = await listPrinters('first');
    expect(old.searches).toEqual({ '90210': '2026-10-17T00:00:00.000Z' });
    await updatePrinter('first', old.id, { status: 'saved' });
    expect((await repo.listPrinters('first'))[0]).toMatchObject({ status: 'saved', searches: { '90210': '2026-10-17T00:00:00.000Z' } });
  });

  it('stops once a search has spent what it held, and shares its searches and page reads across turns', async () => {
    tempRepo();
    requests.length = 0;
    // Each turn here costs $0.08 (10,000 tokens in, 1,000 out, two searches): a $0.10 hold covers one and a bit.
    script = [reply([{ type: 'text', text: 'Looking…' }], 'pause_turn'), reply([{ type: 'text', text: 'Still looking…' }], 'pause_turn'), reply([{ type: 'text', text: 'And more…' }], 'pause_turn')];
    const tool = { name: 't', description: 'd', input_schema: { type: 'object' as const } };
    const err = await research({ system: 's', content: 'c', note: 'test', tool, maxSearches: 3, holdUsd: 0.1, withinMs: 60_000 }).catch((e) => e);
    expect(claudeProblem(err)).toMatch(/a lot of reading/);
    expect(requests).toHaveLength(2);
    const tools = (n: number) => (requests[n].body.tools as { name: string; max_uses?: number }[]).map((t) => `${t.name}:${t.max_uses ?? '-'}`);
    expect(tools(0)).toEqual(['web_search:3', 'web_fetch:3', 't:-']);
    expect(tools(1)).toEqual(['web_search:1', 'web_fetch:2', 't:-']);
    script = [];
  });

  it('stops before the server’s own time limit', async () => {
    tempRepo();
    requests.length = 0;
    const err = await research({ system: 's', content: 'c', note: 'test', tool: { name: 't', description: 'd', input_schema: { type: 'object' } }, maxSearches: 1, holdUsd: 0.1, withinMs: 5_000 }).catch((e) => e);
    expect(claudeProblem(err)).toMatch(/ran out of time/);
    expect(requests).toHaveLength(0);
  });
});

describe('printer links', () => {
  it('open the order without signing in, until expired, turned off or reopened', async () => {
    const { repo } = tempRepo();
    const { project, decision } = await approvedBirthday();
    // Pretend the print files are built.
    await repo.saveDecision({ ...decision, status: 'ready', files: [{ name: 'print.png', key: 'k/print.png', bytes: 1, contentType: 'image/png', label: 'Print file' }] });

    const { token, share } = await createShare(USERS.erin, project.id, 'p-example');
    expect(token).toMatch(new RegExp(`^${decision.id}\\.[A-Za-z0-9_-]{32}$`));
    const stored = (await repo.getDecision(decision.id))!.shares!;
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token.split('.')[1]);
    expect(share).toMatchObject({ printerId: 'p-example', createdBy: 'erin' });
    expect(Date.parse(share.expiresAt) - Date.parse(share.createdAt)).toBe(14 * 86400_000);

    expect((await openShare(token))?.project.id).toBe(project.id);
    for (const bad of [`${decision.id}.${'A'.repeat(32)}`, token.slice(0, -1), 'nonsense', `../${token}`]) expect(await openShare(bad), bad).toBeNull();

    // Expired.
    const d = (await repo.getDecision(decision.id)) as Decision<ShirtSnapshot>;
    await repo.saveDecision({ ...d, shares: d.shares!.map((s) => ({ ...s, expiresAt: '2000-01-01T00:00:00.000Z' })) });
    expect(await openShare(token)).toBeNull();

    // Turned off.
    const second = await createShare(USERS.joel, project.id, null);
    expect(await openShare(second.token)).not.toBeNull();
    await revokeShares(project.id, second.share.hash);
    expect(await openShare(second.token)).toBeNull();

    // Reopened.
    const third = await createShare(USERS.joel, project.id, null);
    await reopen(USERS.joel, project.id);
    expect(await openShare(third.token)).toBeNull();
  });
});
