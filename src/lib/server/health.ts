// Whether the AI services are actually working. Features that use Claude fall
// back to simpler versions when it fails, which hides a broken setup; this
// reads the outcome of recent calls from the spend log so Setup can say so.
import type { SpendEntry } from '@/lib/engine/types';
import { backupIsStale, lastBackup } from './backup';
import { config } from './config';
import { getRepo } from './repo';
import type { Trouble } from './spend';

export interface ServiceTrouble {
  provider: string;
  /** "Claude", "AI artwork". */
  label: string;
  /** What it means for the app while it lasts. */
  effect: string;
  at: string;
  /** What the failed call was for. */
  note: string;
  message: string;
}

const SERVICES: Record<string, [label: string, effect: string]> = {
  anthropic: ['Claude', 'Tweaks and word ideas are using simpler backups, and printer search won’t work.'],
  fal: ['AI artwork', 'New artwork can’t be made.'],
  openai: ['AI artwork', 'New artwork can’t be made.'],
  'claude-svg': ['AI artwork', 'New artwork can’t be made.'],
};

/** A rejected key or missing model won't fix itself; a busy service or one odd prompt usually does. */
export function imageTrouble(e: unknown): Trouble {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  return { message, transient: !/rejected the key|\((401|403|404)\)/.test(message) };
}

/** "just now", "5 minutes ago", "2 days ago": no time zones to get wrong on the server. */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Calls that finished (not still running, and not stopped by the budget), newest first, by service. */
function outcomes(rows: SpendEntry[]): Map<string, SpendEntry[]> {
  const out = new Map<string, SpendEntry[]>();
  for (const r of [...rows].sort((a, b) => b.at.localeCompare(a.at))) {
    if (r.note.endsWith('(in progress)') || r.note.endsWith('(skipped: over budget)') || !SERVICES[r.provider]) continue;
    out.set(r.provider, [...(out.get(r.provider) ?? []), r]);
  }
  return out;
}

/** The last 30 days' calls, newest first: the newest are what matter, and a month can hold more than one read returns. */
export function recentCalls(): Promise<SpendEntry[]> {
  return getRepo().listSpendSince(new Date(Date.now() - 30 * 86_400_000).toISOString(), { newest: 1000 });
}

export interface CallTiming {
  label: string;
  count: number;
  typicalMs: number;
  slowestMs: number;
  /** How long it should usually take, where there's a figure to aim for. */
  targetMs: number | null;
}

/** Kinds of call, by how their spending note starts, with what each should usually take. */
const KINDS: [match: RegExp, label: string, targetMs: number | null][] = [
  [/^design tweak\b/, 'Change something (reading the request)', 20_000],
  [/^word ideas\b/, 'Word ideas', 25_000],
  [/^artwork:/, 'A painting', 90_000],
  [/^printer search\b/, 'Printer search', 180_000],
  [/^new project draft\b/, 'A project from one sentence', null],
  [/^art direction\b/, 'Art direction', null],
  [/^art check\b/, 'Checking artwork for lettering', null],
  [/^vector art\b/, 'Vector artwork (Claude)', null],
  [/^print upscale\b/, 'Print upscale', null],
];

/**
 * How long each kind of AI call has been taking: typical (the median) and
 * slowest, from calls that finished. Calls from before timings were kept, or
 * still running, aren't counted.
 */
export function aiTimings(rows: SpendEntry[]): CallTiming[] {
  const out: CallTiming[] = [];
  for (const [match, label, targetMs] of KINDS) {
    const ms = rows
      .filter((r) => typeof r.ms === 'number' && match.test(r.note) && !r.note.endsWith('(in progress)'))
      .map((r) => r.ms!)
      .sort((a, b) => a - b);
    if (!ms.length) continue;
    out.push({ label, count: ms.length, typicalMs: ms[Math.floor((ms.length - 1) / 2)], slowestMs: ms[ms.length - 1], targetMs });
  }
  return out;
}

/**
 * Services whose latest call failed for a reason that won't fix itself (a bad
 * key, an unknown model), or that failed three times running. One busy moment
 * at the provider isn't worth a warning; the next call that works clears it.
 */
export async function aiTrouble(recent?: SpendEntry[]): Promise<ServiceTrouble[]> {
  const rows = recent ?? (await recentCalls());
  const found: ServiceTrouble[] = [];
  for (const [provider, calls] of outcomes(rows)) {
    const [latest] = calls;
    if (!latest.trouble) continue;
    const streak = calls.slice(0, 3);
    if (latest.trouble.transient && !(streak.length === 3 && streak.every((c) => c.trouble))) continue;
    const [label, effect] = SERVICES[provider];
    found.push({ provider, label, effect, at: latest.at, note: latest.note, message: latest.trouble.message });
  }
  return found;
}

/**
 * The nightly backup, if it has stopped: scheduled (CRON_SECRET set) but the
 * last copy is more than a day and a half old. A schedule that never runs
 * never gets far enough to send an alert, so this is how anyone finds out.
 */
export async function backupTrouble(now = Date.now()): Promise<ServiceTrouble | null> {
  if (!config.cronSecret) return null;
  const last = await lastBackup();
  if (!last || !backupIsStale(last, now)) return null;
  return {
    provider: 'backup',
    label: 'The nightly backup',
    effect: 'Check Vercel → the project → Settings → Cron Jobs, then Setup → Back up now.',
    at: last.at,
    note: 'nightly backup',
    message: `The last copy of the database was saved ${ago(last.at, now)}.`,
  };
}
