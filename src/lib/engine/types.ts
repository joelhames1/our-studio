// The generic decision engine: projects hold options, people react to options,
// and one option gets approved into a decision. Nothing here is shirt-specific,
// which is what lets "where do we go in 2028?" reuse the same machinery later.

/** A person's id. Joel and Erin keep "joel" and "erin" from before households; everyone else gets a random one. */
export type UserId = string;
export type HouseholdId = string;

/** Joel and Erin's: everything made before households belongs to this one. */
export const FIRST_HOUSEHOLD: HouseholdId = 'first';
export type ReactionValue = 'love' | 'maybe' | 'pass';
export type OptionSource = 'seed' | 'remix' | 'ai' | 'tweak' | 'edit';

/** Whoever is signed in, as the app sees them. */
export interface User {
  id: UserId;
  name: string;
  /** Runs the site: Setup, keys and spend. */
  admin: boolean;
  /** The household they're working in, and their part in it. */
  household: HouseholdId;
  role: HouseholdRole;
  /** Every household they belong to, oldest first. */
  households: HouseholdId[];
  /** Their part in each of those. */
  roles: Record<HouseholdId, HouseholdRole>;
}

/** The owner can rename the household and manage its projects; everyone else is a member. */
export type HouseholdRole = 'owner' | 'member';

/** Someone who can sign in. */
export interface Person {
  id: UserId;
  name: string;
  /** The address Google sign-in and email codes match. Lowercase. */
  email?: string;
  /** Runs the site (Joel). */
  siteAdmin?: boolean;
  createdAt: string;
  /** "Sign out everywhere": sessions started before this no longer count. */
  signedOutAt?: string;
  /**
   * Closed (by them) or switched off (by whoever runs the site): they can't
   * sign in and don't show in households, but everything's kept and they can
   * be restored. Someone who closed their own account comes back with an invite.
   */
  archivedAt?: string;
  archivedBy?: UserId;
  archivedWhy?: 'closed' | 'switched-off';
  /** When their data is to be erased for good, if they asked (or whoever runs the site set it). */
  eraseAfter?: string;
  /** When they'd seen how it works (said "Got it", or started their first project), so the welcome stops showing. */
  welcomedAt?: string;
}

/** A family, or any group making things together. Projects belong to one. */
export interface Household {
  id: HouseholdId;
  name: string;
  createdAt: string;
  createdBy?: UserId;
  /** Most it may spend on AI a month, in dollars. Unset: the default for its kind (see spend.ts). */
  budgetUsd?: number;
}

export interface Membership {
  householdId: HouseholdId;
  personId: UserId;
  role: HouseholdRole;
  joinedAt: string;
  /**
   * They're not in it any more: taken out, left, or their account was closed
   * or switched off. Kept so owners can see past members and invite them
   * back; joining again clears it.
   */
  endedAt?: string;
  endedBy?: UserId;
  ended?: 'removed' | 'left' | 'closed' | 'switched-off';
}

/**
 * A way in, sent as a link: into an existing household ("member"), or to start
 * a new one as its owner ("household", only from whoever runs the site). Used
 * once, within a week.
 */
export interface Invite {
  /** SHA-256 of the secret in the link, as hex. The secret itself is only ever in the link. */
  id: string;
  kind: 'member' | 'household';
  /** The household they'll join, or the id the new one will get. */
  householdId: HouseholdId;
  /** A new household's name, until its owner renames it. */
  householdName?: string;
  /** Who it's for, as whoever sent it put it. */
  name: string;
  createdBy: UserId;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedBy?: UserId;
}

/** One signed-in browser, for the list of your devices. */
export interface SessionRecord {
  id: string;
  personId: UserId;
  createdAt: string;
  lastSeenAt: string;
  /** "iPhone · Safari", worked out from the browser's own description (which isn't kept). */
  device: string;
  /** How they signed in: "Google", "an email code", "a personal link". */
  via: string;
}

export interface Project<B = unknown> {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  brief: B;
  status: 'exploring' | 'approved';
  /** Whose project it is. Missing on projects made before households: those are the first household's. */
  householdId?: HouseholdId;
  decisionId?: string | null;
  createdBy?: UserId | 'system';
  /** Who gives the final approval. Missing means whoever started it. */
  approver?: UserId;
  /** Kept for good: it can be archived, but never deleted. */
  keep?: boolean;
  /** Hidden from the home screen, until someone restores it. */
  archived?: boolean;
  /** When and by whom (missing on projects archived before this was recorded). */
  archivedAt?: string;
  archivedBy?: UserId;
}

export interface OptionRecord<P = unknown> {
  id: string;
  projectId: string;
  kind: string;
  createdAt: string;
  createdBy: UserId | 'system';
  source: OptionSource;
  parentId?: string | null;
  /** Options generated together share a batch id. */
  batch?: string;
  /** Short human label, e.g. "Joel's original". */
  label?: string;
  /** Put away for everyone: out of Browse, Favorites and the counts until restored. */
  archived?: { at: string; by: UserId };
  payload: P;
}

export interface Reaction {
  projectId: string;
  optionId: string;
  userId: UserId;
  value: ReactionValue;
  note?: string;
  updatedAt: string;
}

export interface PackageFile {
  name: string;
  key: string;
  bytes: number;
  contentType: string;
  label: string;
}

export interface Decision<S = unknown> {
  id: string;
  projectId: string;
  optionId: string;
  approvedBy: UserId;
  approvedAt: string;
  snapshot: S;
  status: 'building' | 'ready' | 'failed' | 'reopened';
  files?: PackageFile[];
  error?: string;
  /** Links that let a printer see the files without signing in. */
  shares?: ShareLink[];
}

export interface ShareLink {
  /** SHA-256 of the secret part of the link, so stored data can't recreate it. */
  hash: string;
  printerId: string | null;
  createdBy: UserId;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

/** Something worth a record: who did what, to which project, when. */
export type ActivityAction =
  | 'signed-in'
  | 'project-created'
  | 'approved'
  | 'reopened'
  | 'archived'
  | 'restored'
  | 'renamed'
  | 'deleted'
  | 'design-archived'
  | 'design-restored'
  | 'limited'
  | 'agreed'
  | 'household-renamed'
  | 'approver-changed'
  | 'invited'
  | 'invite-cancelled'
  | 'joined'
  | 'left'
  | 'member-removed'
  | 'role-changed'
  | 'account-closed'
  | 'account-switched-off'
  | 'account-restored'
  | 'account-deleted';

export interface ActivityEntry {
  id: string;
  at: string;
  by: UserId;
  action: ActivityAction;
  /** Whose log it's in. Missing on entries from before households: those are the first household's. */
  householdId?: HouseholdId;
  projectId?: string;
  /** The project's name at the time, so the entry still reads right after a rename or delete. */
  projectTitle?: string;
  optionId?: string;
  /** A few words more: how they signed in, the old and new name, which limit. */
  detail?: string;
}

export interface SpendEntry {
  id: string;
  at: string;
  provider: string;
  model: string;
  usd: number;
  note: string;
  projectId?: string;
  /** Whose budget it came out of. Older entries have none: they were the first household's. */
  householdId?: HouseholdId;
  /** Why the call failed, if it did. Transient problems (busy, timed out) usually fix themselves. */
  trouble?: { message: string; transient: boolean };
}
