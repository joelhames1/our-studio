// File-based storage for running on a laptop with zero setup. Not for Vercel:
// serverless disks are wiped between requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { FIRST_HOUSEHOLD, type ActivityAction, type ActivityEntry, type Decision, type Household, type HouseholdId, type Invite, type Membership, type OptionRecord, type Person, type Project, type Reaction, type SessionRecord, type SpendEntry, type UserId } from '@/lib/engine/types';
import type { Printer } from '@/lib/kinds/printers';
import { contentTypeFor, type Repo, type StoredAsset } from './types';

interface DB {
  projects: Project[];
  options: OptionRecord[];
  reactions: Reaction[];
  decisions: Decision[];
  spend: SpendEntry[];
  printers?: Printer[];
  activity?: ActivityEntry[];
  people?: Person[];
  households?: Household[];
  memberships?: Membership[];
  invites?: Invite[];
  sessions?: SessionRecord[];
}

const empty = (): DB => ({ projects: [], options: [], reactions: [], decisions: [], spend: [] });

function safeKey(key: string): string {
  const clean = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, '');
  if (clean.startsWith('/') || clean.includes('..')) throw new Error('Bad asset key');
  return clean;
}

/**
 * Next.js can load this module more than once (one copy per route bundle in
 * dev), so the write lock lives on globalThis and every read goes to disk.
 * Otherwise one route's stale copy could overwrite another route's write.
 */
const g = globalThis as typeof globalThis & { __studioLocalQueue?: Map<string, Promise<unknown>>; __studioLocalHits?: Map<string, { n: number; until: number }> };
const queues = (g.__studioLocalQueue ??= new Map());
/** Rate-limit counters live in memory on a laptop; a restart forgets them, which is fine there. */
const hits = (g.__studioLocalHits ??= new Map());

export class LocalRepo implements Repo {
  readonly name = 'local' as const;
  get where() {
    return `local:${this.dir}`;
  }
  private dbPath: string;
  private assetDir: string;

  constructor(private dir: string) {
    this.dbPath = path.join(dir, 'db.json');
    this.assetDir = path.join(dir, 'assets');
  }

  private async read(): Promise<DB> {
    try {
      return { ...empty(), ...JSON.parse(await fs.readFile(this.dbPath, 'utf8')) };
    } catch {
      return empty();
    }
  }

  /** Serialises writes so two quick taps can't clobber each other. */
  private write(mutate: (db: DB) => void): Promise<void> {
    const prev = queues.get(this.dbPath) ?? Promise.resolve();
    const run = prev.then(async () => {
      const db = await this.read();
      mutate(db);
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db));
      await fs.rename(tmp, this.dbPath);
    });
    queues.set(this.dbPath, run.catch(() => undefined));
    return run;
  }

  async exportAll() {
    return (await this.read()) as unknown as Record<string, unknown[]>;
  }
  importAll(tables: Record<string, unknown[]>) {
    return this.write((db) => {
      Object.assign(db, tables);
    });
  }

  async listProjects() {
    return (await this.read()).projects;
  }
  async getProject(id: string) {
    return (await this.read()).projects.find((p) => p.id === id) ?? null;
  }
  async addProject(p: Project) {
    let added = false;
    await this.write((db) => {
      if (db.projects.some((x) => x.id === p.id)) return;
      db.projects.push(p);
      added = true;
    });
    return added;
  }
  saveProject(p: Project) {
    return this.write((db) => {
      const i = db.projects.findIndex((x) => x.id === p.id);
      if (i >= 0) db.projects[i] = p;
      else db.projects.push(p);
    });
  }

  async listOptions(projectId: string) {
    return (await this.read()).options.filter((o) => o.projectId === projectId);
  }
  async getOption(id: string) {
    return (await this.read()).options.find((o) => o.id === id) ?? null;
  }
  saveOptions(options: OptionRecord[]) {
    return this.write((db) => {
      for (const o of options) {
        const i = db.options.findIndex((x) => x.id === o.id);
        if (i >= 0) db.options[i] = o;
        else db.options.push(o);
      }
    });
  }

  async listReactions(projectId: string) {
    return (await this.read()).reactions.filter((r) => r.projectId === projectId);
  }
  saveReaction(r: Reaction) {
    return this.write((db) => {
      const i = db.reactions.findIndex((x) => x.optionId === r.optionId && x.userId === r.userId);
      if (i >= 0) db.reactions[i] = r;
      else db.reactions.push(r);
    });
  }
  deleteReaction(optionId: string, userId: string) {
    return this.write((db) => {
      db.reactions = db.reactions.filter((x) => !(x.optionId === optionId && x.userId === userId));
    });
  }
  deleteReactionsBy(userId: UserId) {
    return this.write((db) => {
      db.reactions = db.reactions.filter((x) => x.userId !== userId);
    });
  }

  async getDecision(id: string) {
    return (await this.read()).decisions.find((d) => d.id === id) ?? null;
  }
  saveDecision(d: Decision) {
    return this.write((db) => {
      const i = db.decisions.findIndex((x) => x.id === d.id);
      if (i >= 0) db.decisions[i] = d;
      else db.decisions.push(d);
    });
  }

  async listDecisions(projectId: string) {
    return (await this.read()).decisions.filter((d) => d.projectId === projectId);
  }

  deleteProject(id: string) {
    return this.write((db) => {
      db.projects = db.projects.filter((p) => p.id !== id);
      db.options = db.options.filter((o) => o.projectId !== id);
      db.reactions = db.reactions.filter((r) => r.projectId !== id);
      db.decisions = db.decisions.filter((d) => d.projectId !== id);
    });
  }

  addSpend(e: SpendEntry) {
    return this.write((db) => {
      db.spend.push(e);
    });
  }
  updateSpend(e: SpendEntry) {
    return this.write((db) => {
      const i = db.spend.findIndex((x) => x.id === e.id);
      if (i >= 0) db.spend[i] = e;
      else db.spend.push(e);
    });
  }
  deleteSpend(id: string) {
    return this.write((db) => {
      db.spend = db.spend.filter((x) => x.id !== id);
    });
  }
  async listSpendSince(isoDate: string, opts: { newest?: number } = {}) {
    const rows = (await this.read()).spend.filter((s) => s.at >= isoDate);
    return opts.newest ? [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.newest) : rows;
  }
  async spendTotals(isoDate: string) {
    const totals = new Map<HouseholdId, number>();
    for (const r of (await this.read()).spend.filter((s) => s.at >= isoDate)) {
      const h = r.householdId ?? FIRST_HOUSEHOLD;
      totals.set(h, (totals.get(h) ?? 0) + (Number(r.usd) || 0));
    }
    return totals;
  }

  addActivity(e: ActivityEntry) {
    return this.write((db) => {
      (db.activity ??= []).push(e);
    });
  }
  async listActivity(opts: { projectId?: string; before?: string; by?: UserId; action?: ActivityAction; household?: HouseholdId; limit: number }) {
    return ((await this.read()).activity ?? [])
      .filter(
        (e) =>
          (!opts.projectId || e.projectId === opts.projectId) &&
          (!opts.before || e.at < opts.before) &&
          (!opts.by || e.by === opts.by) &&
          (!opts.action || e.action === opts.action) &&
          (!opts.household || (e.householdId ?? FIRST_HOUSEHOLD) === opts.household),
      )
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, opts.limit);
  }
  deleteActivityBy(userId: UserId, actions: ActivityAction[]) {
    return this.write((db) => {
      db.activity = (db.activity ?? []).filter((e) => !(e.by === userId && actions.includes(e.action)));
    });
  }

  async loadDirectory() {
    const db = await this.read();
    return { people: db.people ?? [], households: db.households ?? [], memberships: db.memberships ?? [] };
  }
  savePerson(p: Person) {
    return this.write((db) => {
      const list = (db.people ??= []);
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p;
      else list.push(p);
    });
  }
  saveHousehold(h: Household) {
    return this.write((db) => {
      const list = (db.households ??= []);
      const i = list.findIndex((x) => x.id === h.id);
      if (i >= 0) list[i] = h;
      else list.push(h);
    });
  }
  saveMembership(m: Membership) {
    return this.write((db) => {
      const list = (db.memberships ??= []);
      const i = list.findIndex((x) => x.householdId === m.householdId && x.personId === m.personId);
      if (i >= 0) list[i] = m;
      else list.push(m);
    });
  }
  deletePerson(id: UserId) {
    return this.write((db) => {
      db.people = (db.people ?? []).filter((p) => p.id !== id);
    });
  }
  deleteHousehold(id: HouseholdId) {
    return this.write((db) => {
      db.households = (db.households ?? []).filter((h) => h.id !== id);
    });
  }
  deleteMembership(householdId: HouseholdId, personId: UserId) {
    return this.write((db) => {
      db.memberships = (db.memberships ?? []).filter((m) => !(m.householdId === householdId && m.personId === personId));
    });
  }

  async listInvites() {
    return [...((await this.read()).invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getInvite(id: string) {
    return (await this.read()).invites?.find((i) => i.id === id) ?? null;
  }
  saveInvite(inv: Invite) {
    return this.write((db) => {
      const list = (db.invites ??= []);
      const i = list.findIndex((x) => x.id === inv.id);
      if (i >= 0) list[i] = inv;
      else list.push(inv);
    });
  }
  async claimInvite(inv: Invite, by: UserId, at: string) {
    let got = false;
    await this.write((db) => {
      const found = db.invites?.find((x) => x.id === inv.id);
      if (!found || found.usedAt || found.expiresAt <= at) return;
      found.usedAt = at;
      found.usedBy = by;
      got = true;
    });
    return got;
  }
  deleteInvite(id: string) {
    return this.write((db) => {
      db.invites = (db.invites ?? []).filter((i) => i.id !== id);
    });
  }

  async listSessions(personId: UserId) {
    return ((await this.read()).sessions ?? []).filter((x) => x.personId === personId).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }
  async getSession(id: string) {
    return (await this.read()).sessions?.find((x) => x.id === id) ?? null;
  }
  saveSession(rec: SessionRecord) {
    return this.write((db) => {
      const list = (db.sessions ??= []);
      const i = list.findIndex((x) => x.id === rec.id);
      if (i >= 0) list[i] = rec;
      else list.push(rec);
    });
  }
  touchSession(id: string, at: string) {
    return this.write((db) => {
      const found = db.sessions?.find((x) => x.id === id);
      if (found) found.lastSeenAt = at;
    });
  }
  deleteSession(id: string) {
    return this.write((db) => {
      db.sessions = (db.sessions ?? []).filter((x) => x.id !== id);
    });
  }
  deleteSessionsOf(personId: UserId) {
    return this.write((db) => {
      db.sessions = (db.sessions ?? []).filter((x) => x.personId !== personId);
    });
  }

  async hit(key: string, expires: Date) {
    const now = Date.now();
    for (const [k, v] of hits) if (v.until < now) hits.delete(k);
    const h = hits.get(`${this.dir}|${key}`) ?? { n: 0, until: expires.getTime() };
    h.n += 1;
    hits.set(`${this.dir}|${key}`, h);
    return h.n;
  }

  async listPrinters(household: HouseholdId) {
    return ((await this.read()).printers ?? []).filter((p) => (p.householdId ?? FIRST_HOUSEHOLD) === household);
  }
  savePrinters(printers: Printer[]) {
    return this.write((db) => {
      const list = db.printers ?? [];
      for (const p of printers) {
        const i = list.findIndex((x) => x.id === p.id);
        if (i >= 0) list[i] = p;
        else list.push(p);
      }
      db.printers = list;
    });
  }
  deletePrinter(id: string) {
    return this.write((db) => {
      db.printers = (db.printers ?? []).filter((p) => p.id !== id);
    });
  }

  async putAsset(key: string, data: Buffer) {
    const file = path.join(this.assetDir, safeKey(key));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }
  async getAsset(key: string): Promise<StoredAsset | null> {
    try {
      const data = await fs.readFile(path.join(this.assetDir, safeKey(key)));
      return { data, contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }
  async deleteAssets(keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(path.join(this.assetDir, safeKey(k)), { force: true })));
  }
  async signedUrl() {
    return null;
  }

  async check() {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      return { ok: true, message: `Saving to ${this.dir} on this computer` };
    } catch (e) {
      return { ok: false, message: `Can't write to ${this.dir}: ${(e as Error).message}` };
    }
  }
}
