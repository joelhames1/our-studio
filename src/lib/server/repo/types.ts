import type { ActivityAction, ActivityEntry, Decision, Household, HouseholdId, Invite, Membership, OptionRecord, Person, Project, Reaction, SessionRecord, SpendEntry, UserId } from '@/lib/engine/types';
import type { Printer } from '@/lib/kinds/printers';

/** Storage isn't usable yet; the message says what to fix. Shown to Joel on Home and Setup. */
export class SetupNeeded extends Error {}

/** Everyone who can sign in, every household, and who's in which. */
export interface DirectoryData {
  people: Person[];
  households: Household[];
  memberships: Membership[];
}

export interface StoredAsset {
  data: Buffer;
  contentType: string;
}

/** Storage for the decision engine. Local JSON for dev, Supabase in production. */
export interface Repo {
  readonly name: 'local' | 'supabase';
  /** Which storage this is (a folder, or a Supabase project), so copies of this module in one server share caches. */
  readonly where: string;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(p: Project): Promise<void>;
  /** Saves a brand-new project, never over another: false if its id is already taken. */
  addProject(p: Project): Promise<boolean>;

  listOptions(projectId: string): Promise<OptionRecord[]>;
  getOption(id: string): Promise<OptionRecord | null>;
  saveOptions(options: OptionRecord[]): Promise<void>;

  listReactions(projectId: string): Promise<Reaction[]>;
  saveReaction(r: Reaction): Promise<void>;
  deleteReaction(optionId: string, userId: string): Promise<void>;
  /** Every reaction someone made, on any project (when they delete their account). */
  deleteReactionsBy(userId: UserId): Promise<void>;

  getDecision(id: string): Promise<Decision | null>;
  saveDecision(d: Decision): Promise<void>;
  /** Every approval a project has had, including ones since reopened. */
  listDecisions(projectId: string): Promise<Decision[]>;

  /** Removes a project and everything recorded against it (designs, reactions, approvals). */
  deleteProject(id: string): Promise<void>;

  addSpend(e: SpendEntry): Promise<void>;
  /** Replaces an entry by id (used to settle a hold with the real cost). */
  updateSpend(e: SpendEntry): Promise<void>;
  /** Removes an entry (a hold for a call that was refused). */
  deleteSpend(id: string): Promise<void>;
  /** Entries since a time, oldest first; or just the `newest` few, newest first. */
  listSpendSince(isoDate: string, opts?: { newest?: number }): Promise<SpendEntry[]>;
  /** What each household has spent since a time, added up where the entries are (entries from before households are the first household's). */
  spendTotals(isoDate: string): Promise<Map<HouseholdId, number>>;

  /**
   * The activity log, newest first. `before` pages back from an entry's time;
   * `by`, `action` and `household` narrow it (entries from before households
   * are the first household's: 0006_households.sql marks them so in Supabase).
   */
  addActivity(e: ActivityEntry): Promise<void>;
  listActivity(opts: { projectId?: string; before?: string; by?: UserId; action?: ActivityAction; household?: HouseholdId; limit: number }): Promise<ActivityEntry[]>;
  /** Removes someone's entries of these kinds (their sign-ins and agreements, when they delete their account). */
  deleteActivityBy(userId: UserId, actions: ActivityAction[]): Promise<void>;

  /** People, households and memberships, all at once; null until their setup file has been run. */
  loadDirectory(): Promise<DirectoryData | null>;
  savePerson(p: Person): Promise<void>;
  saveHousehold(h: Household): Promise<void>;
  saveMembership(m: Membership): Promise<void>;
  deletePerson(id: UserId): Promise<void>;
  deleteHousehold(id: HouseholdId): Promise<void>;
  deleteMembership(householdId: HouseholdId, personId: UserId): Promise<void>;

  /** Every invite, newest first; null until their setup file (0007) has been run. */
  listInvites(): Promise<Invite[] | null>;
  getInvite(id: string): Promise<Invite | null>;
  saveInvite(i: Invite): Promise<void>;
  /**
   * Marks an invite used by `by`, but only if it's still unused and in date:
   * true if this call got it, false if someone else did first or it ran out.
   */
  claimInvite(i: Invite, by: UserId, at: string): Promise<boolean>;
  deleteInvite(id: string): Promise<void>;

  /** Signed-in browsers; null from list when their setup file (0007) hasn't been run. */
  listSessions(personId: UserId): Promise<SessionRecord[] | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  saveSession(s: SessionRecord): Promise<void>;
  /** Notes a browser was used just now, only if it's still signed in (so it can't bring a signed-out one back). */
  touchSession(id: string, at: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsOf(personId: UserId): Promise<void>;

  /**
   * Counts one request against `key` and returns how many there have been
   * under that key so far, or null when counting isn't set up yet. The key
   * names its own time window; it's forgotten after `expires`.
   */
  hit(key: string, expires: Date): Promise<number | null>;

  /** The shared printer list. */
  /** One household's printers (those from before households are the first household's). */
  listPrinters(household: HouseholdId): Promise<Printer[]>;
  savePrinters(printers: Printer[]): Promise<void>;
  deletePrinter(id: string): Promise<void>;

  /** Every table, row for row, for the nightly backup; and back again to restore one. */
  exportAll(): Promise<Record<string, unknown[]>>;
  importAll(tables: Record<string, unknown[]>): Promise<void>;

  putAsset(key: string, data: Buffer, contentType: string): Promise<void>;
  getAsset(key: string): Promise<StoredAsset | null>;
  /** Deletes stored files; ones that are already gone are fine. */
  deleteAssets(keys: string[]): Promise<void>;
  /** A short-lived direct download URL, when the backend supports one. */
  signedUrl(key: string, seconds: number, downloadName?: string): Promise<string | null>;

  /** Quick health check for the admin page. */
  check(): Promise<{ ok: boolean; message: string }>;
}

export function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'zip':
      return 'application/zip';
    case 'json':
      return 'application/json';
    case 'txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
