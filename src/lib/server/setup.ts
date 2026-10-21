// What the Setup page shows Joel: what's connected, what isn't, and how to fix it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ADMIN } from './auth';
import { config, MIN_TOKEN_LENGTH } from './config';
import { directoryCounts, FIRST_HOUSEHOLD, listHouseholds, membersOf } from './people';
import { openInvites } from './invites';
import { sendTestAlert } from './alerts';
import { backUp, backupIsStale, lastBackup, type BackupSummary } from './backup';
import { getRepo, SetupNeeded } from './repo';
import { aiTrouble, imageTrouble, type ServiceTrouble } from './health';
import { getImageProvider } from './providers';
import { DEFAULT_HOUSEHOLD_BUDGET_USD, householdBudget, householdOfSpend, monthStart, recordOutcome, spentByHousehold, spentThisMonth } from './spend';
import { ask, z } from './llm/claude';
import type { SpendEntry } from '@/lib/engine/types';

export interface SetupStatus {
  links: { configured: boolean; off: boolean; weak: string[]; minLength: number; erin: string | null; joel: string | null; suggested: { erin: string; joel: string } };
  /** "Continue with Google": whether it's on, which way it goes, who it lets in, and the values Google needs. */
  google: {
    on: boolean;
    /** Straight to Google with the site's own client, rather than through Supabase. */
    direct: boolean;
    /** GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is set but the pair isn't usable yet. */
    clientTrouble: string | null;
    erin: string | null;
    joel: string | null;
    origin: string;
    appCallback: string;
    /** What Google's Branding page asks for, to verify the app. */
    brand: { home: string; privacy: string; terms: string; domain: string; contact: string | null };
  };
  /** "Email me a code": whether it's on, and what it's missing if not. */
  codes: { on: boolean; keySet: boolean; secret: boolean; from: string };
  /** People and households: in the database yet (0006_households.sql), how many, and the first household's people. */
  households: { stored: boolean; count: number; people: number; first: { name: string; email: string | null; you: boolean }[] };
  /** Invites to start a new household: whether their table is there yet (0007), and the ones waiting. */
  invites: { ready: boolean; open: { id: string; name: string; householdName?: string; expiresAt: string }[] };
  storage: { kind: 'local' | 'supabase' | 'missing'; ok: boolean; message: string };
  /** The nightly copy of the database: whether Vercel can start it, and the last one. */
  backups: { scheduled: boolean; last: BackupSummary | null; stale: boolean; suggestedSecret: string };
  /** Emails when something breaks: whether they're on, and to and from whom. */
  alerts: { on: boolean; keySet: boolean; to: string | null; from: string };
  claude: { connected: boolean; model: string };
  art: { provider: string; label: string; model: string; practice: boolean };
  /**
   * The site's spending against MONTHLY_BUDGET_USD, then each household's
   * against its own limit (null: only the site's applies). What was spent on,
   * only for Joel's own household: the others' notes are theirs.
   */
  budget: {
    spent: number;
    limit: number;
    recent: SpendEntry[];
    households: { id: string; name: string; spent: number; limit: number | null; custom: boolean; standard: number | null }[];
    /** Whether budgets can be changed yet (households are in the database). */
    editable: boolean;
    /** What a new household may spend until it's changed. */
    newHouseholds: number;
  };
  /** AI services whose recent calls are failing. */
  trouble: ServiceTrouble[];
  sql: string;
  isVercel: boolean;
}

export async function setupStatus(origin: string): Promise<SetupStatus> {
  let storage: SetupStatus['storage'];
  let recent: SpendEntry[] = [];
  let spent = 0;
  let byHousehold = new Map<string, number>();
  let trouble: ServiceTrouble[] = [];
  try {
    const repo = getRepo();
    const check = await repo.check();
    storage = { kind: repo.name, ...check };
    if (check.ok) {
      spent = await spentThisMonth();
      byHousehold = await spentByHousehold();
      recent = (await repo.listSpendSince(monthStart(), { newest: 500 }))
        .filter((r) => r.usd > 0 && householdOfSpend(r) === ADMIN.household)
        .slice(0, 12);
      trouble = await aiTrouble();
    }
  } catch (e) {
    storage = { kind: 'missing', ok: false, message: e instanceof SetupNeeded ? e.message : (e as Error).message };
  }
  const provider = getImageProvider();
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.sql')).sort();
  const sql = files.length
    ? (await Promise.all(files.map(async (f) => `-- ${f}\n${await fs.readFile(path.join(dir, f), 'utf8')}`))).join('\n')
    : '-- SQL files not found';
  // Shown masked; the copy button fetches the real link (see /api/admin/link).
  const masked = (t?: string) => (t ? `${origin}/k#${t.slice(0, 4)}…${t.slice(-4)}` : null);
  const token = () => randomBytes(24).toString('hex');
  const lastCopy = storage.ok ? await lastBackup() : null;
  return {
    links: {
      configured: !!(config.erinToken && config.joelToken),
      off: config.linksOff,
      weak: config.weakTokens,
      minLength: MIN_TOKEN_LENGTH,
      erin: masked(config.erinToken),
      joel: masked(config.joelToken),
      suggested: { erin: token(), joel: token() },
    },
    google: {
      on: config.googleSignIn,
      direct: config.googleDirect,
      clientTrouble: googleClientTrouble(),
      erin: config.erinEmail ?? null,
      joel: config.joelEmail ?? null,
      origin,
      appCallback: `${origin}/api/auth/callback`,
      brand: {
        home: origin,
        privacy: `${origin}/privacy`,
        terms: `${origin}/terms`,
        // studio.evolvingword.com → evolvingword.com: Google wants the registered domain, not the subdomain.
        domain: new URL(origin).hostname.split('.').slice(-2).join('.'),
        contact: config.contactEmail ?? null,
      },
    },
    codes: {
      on: config.emailCodes,
      keySet: !!config.resendKey,
      secret: !!config.serverSecret,
      from: config.emailFrom,
    },
    households: await householdsStatus(),
    invites: await invitesStatus(),
    storage,
    backups: { scheduled: !!config.cronSecret, last: lastCopy, stale: backupIsStale(lastCopy), suggestedSecret: token() },
    alerts: { on: config.alertsOn, keySet: !!config.resendKey, to: config.alertEmail ?? null, from: config.emailFrom },
    claude: { connected: !!config.anthropicKey, model: config.anthropicModel },
    art: { provider: provider.id, label: provider.label, model: provider.model, practice: provider.id === 'mock' },
    budget: { spent, limit: config.monthlyBudgetUsd, recent, newHouseholds: DEFAULT_HOUSEHOLD_BUDGET_USD, ...(await budgetsStatus(byHousehold)) },
    trouble,
    sql,
    isVercel: config.isVercel,
  };
}

async function householdsStatus(): Promise<SetupStatus['households']> {
  try {
    const [counts, first] = await Promise.all([directoryCounts(), membersOf(FIRST_HOUSEHOLD)]);
    return {
      stored: !!counts,
      count: counts?.households ?? 1,
      people: counts?.people ?? first.length,
      first: first.map((m) => ({ name: m.name, email: m.email ?? null, you: m.id === ADMIN.id })),
    };
  } catch {
    return { stored: false, count: 0, people: 0, first: [] };
  }
}

async function invitesStatus(): Promise<SetupStatus['invites']> {
  try {
    const open = await openInvites(ADMIN, 'household');
    return { ready: !!open, open: (open ?? []).map((i) => ({ id: i.id, name: i.name, householdName: i.householdName, expiresAt: i.expiresAt })) };
  } catch {
    return { ready: false, open: [] };
  }
}

async function budgetsStatus(spent: Map<string, number>): Promise<Pick<SetupStatus['budget'], 'households' | 'editable'>> {
  try {
    const [all, counts] = await Promise.all([listHouseholds(), directoryCounts()]);
    return {
      editable: !!counts,
      households: all.map((h) => ({
        id: h.id,
        name: h.name,
        spent: spent.get(h.id) ?? 0,
        limit: householdBudget(h.id, h),
        custom: typeof h.budgetUsd === 'number',
        standard: householdBudget(h.id, null),
      })),
    };
  } catch {
    return { editable: false, households: [] };
  }
}

/** What's wrong with a half-set Google client, so Setup can say instead of quietly using Supabase. */
function googleClientTrouble(): string | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id && !secret) return null;
  if (id && !config.googleClientId) return 'GOOGLE_CLIENT_ID doesn’t look like a client ID (it ends in .apps.googleusercontent.com). Is the secret in it by mistake?';
  if (!id) return 'GOOGLE_CLIENT_SECRET is set but GOOGLE_CLIENT_ID isn’t.';
  if (!secret) return 'GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET isn’t.';
  return null;
}

/** Someone's full personal link. The token lives after the #, so it never reaches a server log. */
export function personalLink(origin: string, who: 'erin' | 'joel'): string | null {
  const t = who === 'erin' ? config.erinToken : config.joelToken;
  return t ? `${origin}/k#${t}` : null;
}

export type TestTarget = 'claude' | 'art' | 'storage' | 'alert' | 'backup';

export async function testConnection(target: TestTarget): Promise<string> {
  if (target === 'alert') return sendTestAlert();
  if (target === 'backup') {
    const b = await backUp();
    const rows = Object.values(b.rows).reduce((a, n) => a + n, 0);
    return `Saved ${rows} rows to ${b.file} in private storage.`;
  }
  if (target === 'storage') {
    const r = await getRepo().check();
    if (!r.ok) throw new Error(r.message);
    return r.message;
  }
  if (target === 'claude') {
    if (!config.anthropicKey) throw new Error('No ANTHROPIC_API_KEY set.');
    const out = await ask(z.object({ reply: z.string() }), {
      note: 'connection test',
      effort: 'low',
      maxTokens: 2000,
      deadlineMs: 30_000,
      system: 'Reply with a very short, cheerful greeting for Joel and Erin.',
      content: 'Say hi in five words or fewer.',
    });
    return `Claude says: “${out.reply}”`;
  }
  const provider = getImageProvider();
  try {
    const message = await provider.ping();
    await recordOutcome(provider.id, provider.model, 'connection test');
    return message;
  } catch (e) {
    await recordOutcome(provider.id, provider.model, 'connection test', imageTrouble(e));
    throw e;
  }
}
