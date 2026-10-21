// The printer finder on the final screen: searching the web for printers, the
// household's own list that everyone in it sees, and links that let a printer
// download the files without signing in.
import { createHash, randomBytes } from 'node:crypto';
import { GARMENT_STYLES, printPreset, printSizeIn } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import type { Decision, HouseholdId, ShareLink, User, UserId } from '@/lib/engine/types';
import { DAY_MS, FRESH_DAYS, lastSearched, normalZip, PRINT_METHODS, type Printer, type PrinterStatus, type PrintJob, type PrintMethod } from '@/lib/kinds/printers';
import type { ShirtSnapshot } from '@/lib/kinds/shirt';
import { HttpError } from './auth';
import { config } from './config';
import { inksIn } from '@/lib/design/colors';
import { fmtIn } from './export/package';
import { backSvg, designSvg } from './export/render';
import { loadAllFonts } from './fonts';
import { slugify } from './ids';
import { beforeAI } from './consent';
import { searchPrinters, type FoundPrinter } from './llm/tasks';
import { FIRST_HOUSEHOLD } from './people';
import { getRepo } from './repo';
import { sameSecret } from './session';
import { getShirtProject, householdOf, type ShirtProject } from './studio';

/** How long a printer link works. */
export const SHARE_DAYS = 14;
const MAX_LIVE_SHARES = 20;
/** Searching the same ZIP code again this soon (a double tap, or both of you at once) returns the last results. */
const REPEAT_MS = 10 * 60_000;

/** A US ZIP code, or another country's postcode. */
export function cleanZip(v: unknown): string {
  const zip = typeof v === 'string' ? normalZip(v) : '';
  if (!/^[A-Z0-9][A-Z0-9 -]{2,9}$/.test(zip)) throw new HttpError(400, 'That doesn’t look like a ZIP code.');
  return zip;
}

/** The approved order for a project, or a friendly error if there isn't one yet. */
async function approved(projectId: string): Promise<{ project: ShirtProject; decision: Decision<ShirtSnapshot> }> {
  const project = await getShirtProject(projectId);
  const decision = project.decisionId ? ((await getRepo().getDecision(project.decisionId)) as Decision<ShirtSnapshot> | null) : null;
  if (!decision || project.status !== 'approved') throw new HttpError(409, 'Approve a design first, then find a printer.');
  return { project, decision };
}

/** The order, boiled down to what a printer needs to know. */
export async function printJob(decision: Decision<ShirtSnapshot>, title: string): Promise<PrintJob> {
  const snap = decision.snapshot;
  const fonts = await loadAllFonts();
  const color = garmentColor(snap.color);
  const face = { hex: color.hex, tone: color.tone };
  const size = printSizeIn(printPreset(snap.preset));
  const front = inksIn(designSvg(snap.design, snap.copy, fonts, face, (k) => k)).length || 1;
  const back = snap.back
    ? inksIn(backSvg({ design: snap.back.design, facts: snap.back.facts, front: snap.design, copy: snap.copy, wearer: snap.back.names[0] }, fonts, face)).length || 1
    : null;
  const bySize = new Map<string, number>();
  for (const line of snap.sizes) bySize.set(line.size, (bySize.get(line.size) ?? 0) + line.qty);
  return {
    title,
    quantity: snap.sizes.reduce((a, s) => a + s.qty, 0),
    garment: GARMENT_STYLES.find((g) => g.id === snap.garment)?.name ?? 'T-shirt',
    color: color.name,
    dark: color.tone === 'dark',
    sizes: [...bySize].map(([s, n]) => `${s} ×${n}`).join(', '),
    printSize: `${fmtIn(size.w)} × ${fmtIn(size.h)} in`,
    frontInks: front,
    fullColorArt: snap.design.art.kind === 'image',
    backInks: back,
    names: snap.back?.names.length ?? 0,
    notes: snap.notes,
  };
}

// --- The shared list -----------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);

/** Web pages can say anything, so only plain web links survive. */
function webUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Sites where many businesses each have a page, so the domain alone doesn't say which shop it is. */
const SHARED_HOSTS = /(^|\.)(facebook|instagram|yelp|google|goo|linktr|etsy|tiktok|x|twitter|yellowpages|mapquest|bbb|nextdoor|thumbtack|square|business)\.[a-z.]+$/;

/** The same shop gets the same id every search: its domain, or the platform plus its name. */
export function printerId(name: string, website: string | null): string {
  const host = website ? new URL(website).hostname.replace(/^www\./, '') : null;
  const key = !host ? name : SHARED_HOSTS.test(host) ? `${host} ${name}` : host;
  return `p-${slugify(key) || 'printer'}`;
}

/** Tidies what the search found into a printer record. */
export function cleanFound(f: FoundPrinter, zip: string, checkedAt: string): Printer | null {
  const name = str(f.name, 80);
  if (!name) return null;
  const website = webUrl(f.website);
  const email = str(f.email, 120);
  return {
    id: printerId(name, website),
    name,
    kind: f.kind === 'online' ? 'online' : 'local',
    website,
    phone: str(f.phone, 40)?.replace(/[^\d+()\-. x]/g, '').trim() || null,
    // A plain address only: a web page could otherwise slip "?bcc=someone" into the Email them link.
    email: email && /^[a-z0-9._+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(email) ? email : null,
    address: str(f.address, 160),
    area: str(f.area, 80),
    methods: [...new Set((Array.isArray(f.methods) ? f.methods : []).filter((m): m is PrintMethod => (PRINT_METHODS as readonly string[]).includes(m)))],
    ownShirts: f.ownShirts === 'yes' || f.ownShirts === 'no' ? f.ownShirts : 'unknown',
    minimum: str(f.minimum, 80),
    turnaround: str(f.turnaround, 80),
    pricing: str(f.pricing, 240),
    fileRequirements: str(f.fileRequirements, 240),
    howToSend: str(f.howToSend, 160),
    notes: str(f.notes, 240),
    sources: [...new Set((Array.isArray(f.sources) ? f.sources : []).map(webUrl).filter((u): u is string => !!u))].slice(0, 6),
    checkedAt,
    searches: { [zip]: checkedAt },
    status: 'found',
  };
}

/** Printers saved before searches were tracked per ZIP code had a single `zip`. */
function upgrade(p: Printer & { zip?: string }): Printer {
  if (p.searches) return p;
  const { zip, ...rest } = p;
  return { ...rest, searches: zip ? { [zip]: p.checkedAt } : {} };
}

/** A household's printers. Each household has its own list; nobody sees another's searches, shortlist or notes. */
export async function listPrinters(household: string): Promise<Printer[]> {
  return (await getRepo().listPrinters(household)).map(upgrade);
}

/** The same shop found by two households is two records: the first household's keep their old ids. */
const idIn = (household: string, id: string) => (household === FIRST_HOUSEHOLD ? id : `${household}-${id}`);

/**
 * Printers near a ZIP code. A ZIP code searched in the last month reuses what
 * that search found, unless you ask to refresh; one searched in the last few
 * minutes always does.
 */
export async function findPrinters(user: User, projectId: string, zipInput: unknown, refresh = false) {
  const zip = cleanZip(zipInput);
  const { project, decision } = await approved(projectId);
  const household = householdOf(project);
  const last = lastSearched(await listPrinters(household), zip);
  const age = last ? Date.now() - Date.parse(last) : Infinity;
  const reuse = age < REPEAT_MS || (!refresh && age < FRESH_DAYS * DAY_MS);
  if (!reuse) {
    if (!config.anthropicKey) throw new HttpError(400, `Printer search uses Claude, which isn’t connected yet.${user.admin ? ' Add ANTHROPIC_API_KEY in Setup.' : ''}`);
    await beforeAI(user, 'search');
    await search(zip, await printJob(decision, project.title), household);
  }
  if (project.brief.printZip !== zip) {
    project.brief.printZip = zip;
    project.updatedAt = new Date().toISOString();
    await getRepo().saveProject(project);
  }
  return { ...(await printerState(projectId)), searched: !reuse };
}

/** Searches the web and makes this ZIP code's results on the household's list match what it found. */
async function search(zip: string, job: PrintJob, household: string) {
  const now = new Date().toISOString();
  // One record per shop, even if the search lists it twice.
  const byId = new Map<string, Printer>();
  for (const f of await searchPrinters(zip, job)) {
    const found = cleanFound(f, zip, now);
    const p = found && { ...found, id: idIn(household, found.id), householdId: household };
    if (p && !byId.has(p.id)) byId.set(p.id, p);
  }
  if (!byId.size) throw new HttpError(502, 'The search didn’t turn up any printers. Try a nearby ZIP code?');

  // Read the list again now: a search takes minutes, and someone may have saved a shop meanwhile.
  const known = await listPrinters(household);
  const old = new Map(known.map((p) => [p.id, p]));
  // Fresh details, but keep your shortlist, your notes, and the other ZIP codes that found it.
  const save = [...byId.values()].map((p) => {
    const was = old.get(p.id);
    return was ? { ...p, status: was.status, note: was.note, searches: { ...was.searches, [zip]: now } } : p;
  });
  // Shops this ZIP code found last time but not now: gone, unless you kept them or another ZIP code found them too.
  const gone: string[] = [];
  for (const p of known) {
    if (byId.has(p.id) || !p.searches[zip]) continue;
    const searches = Object.fromEntries(Object.entries(p.searches).filter(([z]) => z !== zip));
    if (p.status === 'found' && !Object.keys(searches).length) gone.push(p.id);
    else save.push({ ...p, searches });
  }
  const repo = getRepo();
  await repo.savePrinters(save);
  for (const id of gone) await repo.deletePrinter(id);
}

/** The ZIP code searched most recently, by anyone, for any project. */
function latestZip(printers: Printer[]): string | null {
  let latest: [string, string] | null = null;
  for (const p of printers) for (const [zip, at] of Object.entries(p.searches)) if (!latest || at > latest[1]) latest = [zip, at];
  return latest?.[0] ?? null;
}

/** What the finder shows: the order, the ZIP code to show results for, and the list. */
export async function printerState(projectId: string) {
  const { project, decision } = await approved(projectId);
  const printers = await listPrinters(householdOf(project));
  // A new project starts from the last ZIP code searched, so those results show straight away.
  return { job: await printJob(decision, project.title), zip: project.brief.printZip ?? latestZip(printers) ?? '', printers };
}

const STATUSES: PrinterStatus[] = ['found', 'saved', 'used'];

export async function updatePrinter(household: string, id: string, patch: { status?: unknown; note?: unknown }): Promise<Printer> {
  const repo = getRepo();
  const printer = (await listPrinters(household)).find((p) => p.id === id);
  if (!printer) throw new HttpError(404, 'That printer isn’t on the list any more.');
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as PrinterStatus)) throw new HttpError(400, 'Bad request.');
    printer.status = patch.status as PrinterStatus;
  }
  if (patch.note !== undefined) {
    if (patch.note !== null && typeof patch.note !== 'string') throw new HttpError(400, 'Bad request.');
    printer.note = patch.note ? patch.note.slice(0, 300) : undefined;
  }
  await repo.savePrinters([printer]);
  return printer;
}

export async function removePrinter(household: string, id: string): Promise<void> {
  if (!(await listPrinters(household)).some((p) => p.id === id)) throw new HttpError(404, 'That printer isn’t on the list any more.');
  await getRepo().deletePrinter(id);
}

// --- Links for printers -------------------------------------------------------------

const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex');
const live = (s: ShareLink, now = Date.now()) => !s.revokedAt && Date.parse(s.expiresAt) > now;

/**
 * A link a printer can open without signing in: the approval's id plus a long
 * random secret. Only the secret's hash is stored. Works for two weeks, and
 * stops when it's turned off or the design is reopened.
 */
export async function createShare(user: User, projectId: string, printerIdInput: unknown): Promise<{ token: string; share: ShareLink }> {
  const { decision } = await approved(projectId);
  if (decision.status !== 'ready') throw new HttpError(409, 'The print files are still being made. Try again in a moment.');
  const printerId = typeof printerIdInput === 'string' && printerIdInput.length <= 120 ? printerIdInput : null;
  const shares = decision.shares ?? [];
  if (shares.filter((s) => live(s)).length >= MAX_LIVE_SHARES) throw new HttpError(429, 'That’s a lot of open links. Turn some off first.');
  const secret = randomBytes(24).toString('base64url');
  const now = new Date();
  const share: ShareLink = {
    hash: hashOf(secret),
    printerId,
    createdBy: user.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SHARE_DAYS * 86400_000).toISOString(),
  };
  decision.shares = [...shares, share];
  await getRepo().saveDecision(decision);
  return { token: `${decision.id}.${secret}`, share };
}

/** Turns off one link (by its hash), or every link for this approval. */
export async function revokeShares(projectId: string, hash: unknown): Promise<void> {
  const { decision } = await approved(projectId);
  const at = new Date().toISOString();
  decision.shares = (decision.shares ?? []).map((s) => (live(s) && (hash === undefined || hash === null || s.hash === hash) ? { ...s, revokedAt: at } : s));
  await getRepo().saveDecision(decision);
}

/** Turns off the live links on a project's approvals that `revoke` picks. */
async function revokeWhere(projectId: string, revoke: (s: ShareLink) => boolean): Promise<void> {
  const repo = getRepo();
  const at = new Date().toISOString();
  for (const d of await repo.listDecisions(projectId)) {
    if (!(d.shares ?? []).some((s) => live(s) && revoke(s))) continue;
    await repo.saveDecision({ ...d, shares: d.shares!.map((s) => (live(s) && revoke(s) ? { ...s, revokedAt: at } : s)) });
  }
}

/** Put away: a project's printer links stop, so a printer can't keep opening files nobody's using. */
export async function revokeProjectShares(projectId: string): Promise<void> {
  await revokeWhere(projectId, () => true);
}

/** Someone's gone from a household: the printer links they made there stop with them. */
export async function revokeSharesBy(personId: UserId, household: HouseholdId): Promise<void> {
  for (const p of (await getRepo().listProjects()) as ShirtProject[]) {
    if (householdOf(p) === household) await revokeWhere(p.id, (s) => s.createdBy === personId);
  }
}

/** What a printer link opens, or null if it's wrong, expired, turned off, or the design was reopened. */
export async function openShare(token: string): Promise<{ decision: Decision<ShirtSnapshot>; project: ShirtProject; share: ShareLink } | null> {
  const m = /^([a-z0-9]{6,40})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const repo = getRepo();
  const decision = (await repo.getDecision(m[1])) as Decision<ShirtSnapshot> | null;
  if (!decision || decision.status !== 'ready') return null;
  const hash = hashOf(m[2]);
  const share = (decision.shares ?? []).find((s) => sameSecret(s.hash, hash));
  if (!share || !live(share)) return null;
  const project = (await repo.getProject(decision.projectId)) as ShirtProject | null;
  if (!project || project.decisionId !== decision.id) return null;
  return { decision, project, share };
}
