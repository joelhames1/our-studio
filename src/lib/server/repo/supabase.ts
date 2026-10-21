// Supabase storage: Postgres tables with a jsonb `data` column per record, plus
// a private Storage bucket for images and print files. The service-role key
// lives only on the server; tables have row-level security on with no
// policies, so nothing is reachable from a browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ActivityAction, ActivityEntry, Decision, Household, HouseholdId, Invite, Membership, OptionRecord, Person, Project, Reaction, SessionRecord, SpendEntry, UserId } from '@/lib/engine/types';
import { FIRST_HOUSEHOLD } from '@/lib/engine/types';
import type { Printer } from '@/lib/kinds/printers';
import { SetupNeeded, type DirectoryData, type Repo, type StoredAsset } from './types';

const BUCKET = 'studio';

/** Each table, a column it has, and the setup file that makes it. */
const TABLES: [table: string, column: string, file: string][] = [
  ['projects', 'id', '0001_studio.sql'],
  ['options', 'id', '0001_studio.sql'],
  ['reactions', 'option_id', '0001_studio.sql'],
  ['decisions', 'id', '0001_studio.sql'],
  ['spend', 'id', '0001_studio.sql'],
  ['printers', 'id', '0004_printers.sql'],
  ['activity', 'id', '0005_activity_and_limits.sql'],
  ['rate_limits', 'key', '0005_activity_and_limits.sql'],
  ['people', 'id', '0006_households.sql'],
  ['households', 'id', '0006_households.sql'],
  ['memberships', 'person_id', '0006_households.sql'],
  ['invites', 'id', '0007_invites_and_sessions.sql'],
  ['sessions', 'id', '0007_invites_and_sessions.sql'],
];

/**
 * What a backup holds: every table but the rate-limit counters, which only
 * matter for the hour they're in, and signed-in browsers, which a restore
 * shouldn't bring back.
 */
const BACKED_UP = TABLES.map(([table]) => table).filter((table) => table !== 'rate_limits' && table !== 'sessions');
/**
 * Rows per request. Supabase sends at most its "Max rows" setting per request
 * (1,000 unless it's been changed), whatever limit is asked for, so anything
 * that can be longer is read a page at a time. Keep that setting at 1,000 or more.
 */
const PAGE = 1000;
/** Each table's key, for a stable order to page through. */
const KEY: Record<string, string[]> = { reactions: ['option_id', 'user_id'], memberships: ['household_id', 'person_id'], rate_limits: ['key'] };
const keyOf = (table: string) => KEY[table] ?? ['id'];
type Page = PromiseLike<{ data: unknown; error: SupabaseError }>;

/** A table or function that a later setup file adds, and that file hasn't been run yet. */
const notThereYet = (error: SupabaseError) => ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code ?? '');

/** The role inside an old-style (JWT) Supabase key, without verifying it. */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return (JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/** Catches the usual copy-and-paste mix-ups before anything is sent. */
export function supabaseConfigProblem(url: string, key: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'SUPABASE_URL isn’t a web address. Use the Project URL, like https://abcdefgh.supabase.co.';
  }
  if (/(^|\.)supabase\.com$/i.test(u.hostname)) {
    return 'SUPABASE_URL is the Supabase dashboard address. Use the Project URL instead, like https://abcdefgh.supabase.co (Project Settings → Data API).';
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return 'SUPABASE_URL should start with https://.';
  if (key.startsWith('sb_publishable_')) {
    return 'SUPABASE_SECRET_KEY holds the publishable key. The app needs the secret key (starts sb_secret_) from Project Settings → API Keys.';
  }
  const role = jwtRole(key);
  if (role === 'anon' || role === 'authenticated') {
    return 'The Supabase key is the public anon key. Use the service_role key, or the newer secret key (starts sb_secret_), from Project Settings → API Keys.';
  }
  return null;
}

type SupabaseError = { message?: string; code?: string; details?: string | null; status?: number } | null;

/** Turns the Supabase errors that mean "setup isn't finished" into advice; anything else stays an error. */
export function explainSupabaseError(what: string, error: SupabaseError, host: string): Error {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
  const code = error?.code ?? '';
  if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(text)) {
    return new SetupNeeded('Supabase is connected, but the tables aren’t there yet. Run the setup SQL in Supabase’s SQL Editor (it’s on the Setup page, and in supabase/migrations).');
  }
  if (/invalid api key|unregistered api key|no api key|jwt|unauthorized/i.test(text) || code === 'PGRST301' || code === 'PGRST302') {
    return new SetupNeeded('Supabase didn’t accept the key. Copy the secret key (starts sb_secret_) again from Project Settings → API Keys into SUPABASE_SECRET_KEY, then redeploy.');
  }
  if (code === '42501' || /permission denied|row-level security/i.test(text)) {
    return new SetupNeeded(
      'Supabase refused access to the tables. Either the key is the publishable/anon one instead of the secret one, or the tables were never granted to the server: run supabase/migrations/0003_server_access.sql in the SQL Editor.',
    );
  }
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|getaddrinfo|ETIMEDOUT/i.test(text)) {
    return new SetupNeeded(`Couldn’t reach Supabase at ${host}. Check SUPABASE_URL is the Project URL (https://<your-project>.supabase.co) and that the project isn’t paused.`);
  }
  return new Error(`Supabase ${what} failed: ${error?.message ?? 'unknown error'}${code ? ` (${code})` : ''}`);
}

export class SupabaseRepo implements Repo {
  readonly name = 'supabase' as const;
  get where() {
    return `supabase:${this.host}`;
  }
  private sb: SupabaseClient;
  private host: string;
  private bucketReady: Promise<void> | null = null;

  constructor(url: string, serviceKey: string) {
    // Just the origin: a pasted ".../rest/v1/" or trailing slash would break every request.
    const origin = new URL(url).origin;
    this.host = new URL(url).host;
    this.sb = createClient(origin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private fail(what: string, error: SupabaseError): never {
    throw explainSupabaseError(what, error, this.host);
  }

  /** Every row a query matches, a page at a time; null if its table hasn't been made yet and `missing` says that's fine. */
  private async paged<T>(what: string, page: (from: number, to: number) => Page, missing?: 'ok'): Promise<T[] | null> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      if (error) {
        if (missing && notThereYet(error)) return null;
        this.fail(what, error);
      }
      const rows = (data ?? []) as { data: T }[];
      out.push(...rows.map((r) => r.data));
      if (rows.length < PAGE) return out;
    }
  }

  private async rows<T>(table: string, column?: string, value?: string): Promise<T[]> {
    return (await this.paged<T>(`read ${table}`, (from, to) => {
      let q = this.sb.from(table).select('data');
      if (column) q = q.eq(column, value!);
      q = q.order('created_at', { ascending: true });
      for (const k of keyOf(table)) q = q.order(k, { ascending: true });
      return q.range(from, to);
    }))!;
  }

  private async one<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await this.sb.from(table).select('data').eq('id', id).maybeSingle();
    if (error) this.fail(`read ${table}`, error);
    return (data?.data as T) ?? null;
  }

  listProjects() {
    return this.rows<Project>('projects');
  }
  getProject(id: string) {
    return this.one<Project>('projects', id);
  }
  async saveProject(p: Project) {
    const { error } = await this.sb.from('projects').upsert({ id: p.id, data: p });
    if (error) this.fail('save project', error);
  }

  listOptions(projectId: string) {
    return this.rows<OptionRecord>('options', 'project_id', projectId);
  }
  getOption(id: string) {
    return this.one<OptionRecord>('options', id);
  }
  async saveOptions(options: OptionRecord[]) {
    if (!options.length) return;
    const { error } = await this.sb
      .from('options')
      .upsert(options.map((o) => ({ id: o.id, project_id: o.projectId, data: o, created_at: o.createdAt })));
    if (error) this.fail('save options', error);
  }

  async listReactions(projectId: string) {
    const { data, error } = await this.sb.from('reactions').select('data').eq('project_id', projectId).limit(10000);
    if (error) this.fail('read reactions', error);
    return (data ?? []).map((r) => r.data as Reaction);
  }
  async saveReaction(r: Reaction) {
    const { error } = await this.sb
      .from('reactions')
      .upsert({ option_id: r.optionId, user_id: r.userId, project_id: r.projectId, data: r, updated_at: r.updatedAt });
    if (error) this.fail('save reaction', error);
  }
  async deleteReaction(optionId: string, userId: string) {
    const { error } = await this.sb.from('reactions').delete().eq('option_id', optionId).eq('user_id', userId);
    if (error) this.fail('delete reaction', error);
  }
  async deleteReactionsBy(userId: UserId) {
    const { error } = await this.sb.from('reactions').delete().eq('user_id', userId);
    if (error) this.fail('delete reactions', error);
  }

  getDecision(id: string) {
    return this.one<Decision>('decisions', id);
  }
  async saveDecision(d: Decision) {
    const { error } = await this.sb.from('decisions').upsert({ id: d.id, project_id: d.projectId, data: d });
    if (error) this.fail('save decision', error);
  }

  async listDecisions(projectId: string) {
    const { data, error } = await this.sb.from('decisions').select('data').eq('project_id', projectId).limit(1000);
    if (error) this.fail('read decisions', error);
    return (data ?? []).map((r) => r.data as Decision);
  }

  async deleteProject(id: string) {
    // Children first, so a failure part-way never leaves designs without their project.
    for (const table of ['reactions', 'options', 'decisions'] as const) {
      const { error } = await this.sb.from(table).delete().eq('project_id', id);
      if (error) this.fail(`delete ${table}`, error);
    }
    const { error } = await this.sb.from('projects').delete().eq('id', id);
    if (error) this.fail('delete project', error);
  }

  async addSpend(e: SpendEntry) {
    const { error } = await this.sb.from('spend').insert({ id: e.id, at: e.at, usd: e.usd, data: e });
    if (error) this.fail('record spend', error);
  }
  async updateSpend(e: SpendEntry) {
    const { error } = await this.sb.from('spend').update({ usd: e.usd, data: e }).eq('id', e.id);
    if (error) this.fail('record spend', error);
  }
  async deleteSpend(id: string) {
    const { error } = await this.sb.from('spend').delete().eq('id', id);
    if (error) this.fail('release spend hold', error);
  }
  async listSpendSince(isoDate: string, opts: { newest?: number } = {}) {
    if (opts.newest) {
      const { data, error } = await this.sb.from('spend').select('data').gte('at', isoDate).order('at', { ascending: false }).limit(Math.min(opts.newest, PAGE));
      if (error) this.fail('read spend', error);
      return (data ?? []).map((r) => r.data as SpendEntry);
    }
    return (await this.paged<SpendEntry>('read spend', (from, to) => this.sb.from('spend').select('data').gte('at', isoDate).order('at').order('id').range(from, to)))!;
  }
  /** Until when to add up spending here rather than in the database, after finding 0008's function missing. */
  private totalsMissingUntil = 0;
  async spendTotals(isoDate: string) {
    if (Date.now() >= this.totalsMissingUntil) {
      const { data, error } = await this.sb.rpc('spend_totals', { since: isoDate });
      if (!error) return new Map(((data ?? []) as { household_id: string; usd: number | string }[]).map((r) => [r.household_id, Number(r.usd) || 0]));
      if (!notThereYet(error)) this.fail('add up spending', error);
      this.totalsMissingUntil = Date.now() + 5 * 60_000;
    }
    // Before 0008: every row, a page at a time (slower, still right).
    const totals = new Map<HouseholdId, number>();
    for (const r of await this.listSpendSince(isoDate)) {
      const h = r.householdId ?? FIRST_HOUSEHOLD;
      totals.set(h, (totals.get(h) ?? 0) + (Number(r.usd) || 0));
    }
    return totals;
  }

  async addActivity(e: ActivityEntry) {
    const { error } = await this.sb.from('activity').insert({ id: e.id, at: e.at, project_id: e.projectId ?? null, data: e });
    if (error) this.fail('record activity', error);
  }
  async listActivity(opts: { projectId?: string; before?: string; by?: UserId; action?: ActivityAction; household?: HouseholdId; limit: number }) {
    let q = this.sb.from('activity').select('data');
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    if (opts.before) q = q.lt('at', opts.before);
    if (opts.by) q = q.eq('data->>by', opts.by);
    if (opts.action) q = q.eq('data->>action', opts.action);
    if (opts.household) q = q.eq('data->>householdId', opts.household);
    const { data, error } = await q.order('at', { ascending: false }).limit(opts.limit);
    if (error) this.fail('read activity', error);
    return (data ?? []).map((r) => r.data as ActivityEntry);
  }
  async deleteActivityBy(userId: UserId, actions: ActivityAction[]) {
    const { error } = await this.sb.from('activity').delete().eq('data->>by', userId).in('data->>action', actions);
    if (error) this.fail('delete activity', error);
  }

  async loadDirectory(): Promise<DirectoryData | null> {
    const read = <T,>(table: 'people' | 'households' | 'memberships') =>
      this.paged<T>(`read ${table}`, (from, to) => {
        let q = this.sb.from(table).select('data').order('created_at', { ascending: true });
        for (const k of keyOf(table)) q = q.order(k, { ascending: true });
        return q.range(from, to);
      }, 'ok');
    const [people, households, memberships] = await Promise.all([read<Person>('people'), read<Household>('households'), read<Membership>('memberships')]);
    if (!people || !households || !memberships) return null;
    return { people, households, memberships };
  }
  async savePerson(p: Person) {
    const { error } = await this.sb.from('people').upsert({ id: p.id, email: p.email ?? null, data: p, created_at: p.createdAt });
    if (error) this.fail('save person', error);
  }
  async saveHousehold(h: Household) {
    const { error } = await this.sb.from('households').upsert({ id: h.id, data: h, created_at: h.createdAt });
    if (error) this.fail('save household', error);
  }
  async saveMembership(m: Membership) {
    const { error } = await this.sb
      .from('memberships')
      .upsert({ household_id: m.householdId, person_id: m.personId, data: m, created_at: m.joinedAt });
    if (error) this.fail('save membership', error);
  }
  async deletePerson(id: UserId) {
    const { error } = await this.sb.from('people').delete().eq('id', id);
    if (error) this.fail('delete person', error);
  }
  async deleteHousehold(id: HouseholdId) {
    const { error } = await this.sb.from('households').delete().eq('id', id);
    if (error) this.fail('delete household', error);
  }
  async deleteMembership(householdId: HouseholdId, personId: UserId) {
    const { error } = await this.sb.from('memberships').delete().eq('household_id', householdId).eq('person_id', personId);
    if (error) this.fail('delete membership', error);
  }

  async listInvites(): Promise<Invite[] | null> {
    const { data, error } = await this.sb.from('invites').select('data').order('created_at', { ascending: false }).limit(1000);
    if (error) {
      if (notThereYet(error)) return null;
      this.fail('read invites', error);
    }
    return (data ?? []).map((r) => r.data as Invite);
  }
  async getInvite(id: string) {
    const { data, error } = await this.sb.from('invites').select('data').eq('id', id).maybeSingle();
    if (error) {
      if (notThereYet(error)) return null;
      this.fail('read invite', error);
    }
    return (data?.data as Invite | undefined) ?? null;
  }
  async saveInvite(i: Invite) {
    const { error } = await this.sb
      .from('invites')
      .upsert({ id: i.id, household_id: i.householdId, expires_at: i.expiresAt, used_at: i.usedAt ?? null, data: i, created_at: i.createdAt });
    if (error) this.fail('save invite', error);
  }
  async claimInvite(i: Invite, by: UserId, at: string) {
    // One statement, so two people opening the same link at once can't both get in.
    const { data, error } = await this.sb
      .from('invites')
      .update({ used_at: at, data: { ...i, usedAt: at, usedBy: by } })
      .eq('id', i.id)
      .is('used_at', null)
      .gt('expires_at', at)
      .select('id');
    if (error) this.fail('use invite', error);
    return (data ?? []).length === 1;
  }
  async deleteInvite(id: string) {
    const { error } = await this.sb.from('invites').delete().eq('id', id);
    if (error) this.fail('delete invite', error);
  }

  async listSessions(personId: UserId): Promise<SessionRecord[] | null> {
    const { data, error } = await this.sb.from('sessions').select('data').eq('person_id', personId).order('last_seen_at', { ascending: false }).limit(200);
    if (error) {
      if (notThereYet(error)) return null;
      this.fail('read sessions', error);
    }
    return (data ?? []).map((r) => r.data as SessionRecord);
  }
  async getSession(id: string) {
    const { data, error } = await this.sb.from('sessions').select('data').eq('id', id).maybeSingle();
    if (error) this.fail('read session', error);
    return (data?.data as SessionRecord | undefined) ?? null;
  }
  async saveSession(x: SessionRecord) {
    const { error } = await this.sb.from('sessions').upsert({ id: x.id, person_id: x.personId, last_seen_at: x.lastSeenAt, data: x, created_at: x.createdAt });
    if (error) this.fail('save session', error);
  }
  async touchSession(id: string, at: string) {
    const { data, error } = await this.sb.from('sessions').select('data').eq('id', id).maybeSingle();
    if (error) this.fail('read session', error);
    if (!data) return;
    // Only an update: a browser signed out in the meantime stays signed out.
    const { error: e2 } = await this.sb
      .from('sessions')
      .update({ last_seen_at: at, data: { ...(data.data as SessionRecord), lastSeenAt: at } })
      .eq('id', id);
    if (e2) this.fail('save session', e2);
  }
  async deleteSession(id: string) {
    const { error } = await this.sb.from('sessions').delete().eq('id', id);
    if (error) this.fail('delete session', error);
  }
  async deleteSessionsOf(personId: UserId) {
    const { error } = await this.sb.from('sessions').delete().eq('person_id', personId);
    if (error) this.fail('delete sessions', error);
  }

  /** Until when to stop asking, after finding the counter's setup file hasn't been run. */
  private limitsMissingUntil = 0;
  async hit(key: string, expires: Date) {
    if (Date.now() < this.limitsMissingUntil) return null;
    const { data, error } = await this.sb.rpc('rate_hit', { p_key: key, p_expires: expires.toISOString() });
    if (error) {
      if (notThereYet(error)) {
        this.limitsMissingUntil = Date.now() + 5 * 60_000;
        return null;
      }
      this.fail('count request', error);
    }
    return typeof data === 'number' ? data : Number(data);
  }

  async listPrinters(household: HouseholdId) {
    return (await this.paged<Printer>('read printers', (from, to) => {
      // Printers from before households have no household of their own: they're the first one's.
      const q = this.sb.from('printers').select('data');
      const mine = household === FIRST_HOUSEHOLD ? q.or(`data->>householdId.is.null,data->>householdId.eq.${FIRST_HOUSEHOLD}`) : q.eq('data->>householdId', household);
      return mine.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
    }))!;
  }
  async savePrinters(printers: Printer[]) {
    if (!printers.length) return;
    const at = new Date().toISOString();
    const { error } = await this.sb.from('printers').upsert(printers.map((p) => ({ id: p.id, data: p, updated_at: at })));
    if (error) this.fail('save printers', error);
  }
  async deletePrinter(id: string) {
    const { error } = await this.sb.from('printers').delete().eq('id', id);
    if (error) this.fail('remove printer', error);
  }

  private ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        const { data } = await this.sb.storage.getBucket(BUCKET);
        if (data) return;
        const { error } = await this.sb.storage.createBucket(BUCKET, { public: false });
        if (error && !/already exists/i.test(error.message)) this.fail('create storage bucket', error);
      })();
      this.bucketReady.catch(() => (this.bucketReady = null));
    }
    return this.bucketReady;
  }

  async exportAll() {
    const out: Record<string, unknown[]> = {};
    for (const table of BACKED_UP) {
      const rows: unknown[] = [];
      // In key order, and until a page comes back empty, so a lower "Max rows" can't quietly cut a backup short.
      for (let from = 0; ; ) {
        let q = this.sb.from(table).select('*');
        for (const k of keyOf(table)) q = q.order(k, { ascending: true });
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) {
          // A table from a setup file that hasn't been run yet has nothing to back up.
          if (notThereYet(error)) break;
          this.fail(`back up ${table}`, error);
        }
        if (!data?.length) break;
        rows.push(...data);
        from += data.length;
      }
      out[table] = rows;
    }
    return out;
  }
  async importAll(tables: Record<string, unknown[]>) {
    for (const table of BACKED_UP) {
      const rows = tables[table] ?? [];
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await this.sb.from(table).upsert(rows.slice(i, i + PAGE) as never[]);
        if (error) this.fail(`restore ${table}`, error);
      }
    }
  }

  async putAsset(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    const { error } = await this.sb.storage.from(BUCKET).upload(key, data, { contentType, upsert: true });
    if (error) this.fail('upload', error);
  }
  async getAsset(key: string): Promise<StoredAsset | null> {
    await this.ensureBucket();
    const { data, error } = await this.sb.storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
  }
  async deleteAssets(keys: string[]) {
    if (!keys.length) return;
    await this.ensureBucket();
    for (let i = 0; i < keys.length; i += 100) {
      const { error } = await this.sb.storage.from(BUCKET).remove(keys.slice(i, i + 100));
      if (error) this.fail('delete files', error);
    }
  }
  async signedUrl(key: string, seconds: number, downloadName?: string) {
    await this.ensureBucket();
    const { data, error } = await this.sb.storage
      .from(BUCKET)
      .createSignedUrl(key, seconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async check() {
    // Every table, so a setup file that was skipped gets named.
    const results = await Promise.all(TABLES.map(async ([table, column, file]) => ({ table, file, error: (await this.sb.from(table).select(column).limit(1)).error })));
    const failed = results.find((r) => r.error);
    if (failed) {
      const missing = failed.error!.code === '42P01' || failed.error!.code === 'PGRST205';
      const first = failed.table === TABLES[0][0];
      const message = missing && !first
        ? `Supabase is connected, but the ${failed.table} table isn’t there yet. Run supabase/migrations/${failed.file} in Supabase’s SQL Editor (it’s also in the setup SQL below).`
        : explainSupabaseError('check', failed.error, this.host).message;
      return { ok: false, message };
    }
    try {
      await this.ensureBucket();
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    // Functions too: without 0008, budgets still work but every AI call reads the whole month.
    const totals = await this.sb.rpc('spend_totals', { since: new Date().toISOString() });
    if (totals.error) {
      const message = notThereYet(totals.error)
        ? 'Supabase is connected, but the spend_totals function isn’t there yet. Run supabase/migrations/0008_spend_totals.sql in Supabase’s SQL Editor (it’s also in the setup SQL below).'
        : explainSupabaseError('check', totals.error, this.host).message;
      return { ok: false, message };
    }
    const { data: bucket } = await this.sb.storage.getBucket(BUCKET);
    if (bucket?.public) {
      return {
        ok: false,
        message: `The "${BUCKET}" storage bucket is public, so anyone with a file's address could open it. Run the setup SQL below (or Storage → ${BUCKET} → Edit bucket → turn off Public).`,
      };
    }
    return { ok: true, message: 'Connected to Supabase (database + private file storage)' };
  }
}
