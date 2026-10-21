// A copy of the whole database every night, kept in the same private storage
// as the artwork: backups/2026-10-21.json and so on, one for each night, and
// any older than a month are deleted, so a month of copies is always there and
// something erased is gone from them within a month. It guards against mistakes (a project deleted by
// accident, a change that went wrong), not against losing the Supabase project
// itself; Supabase Pro's own backups cover that. The artwork and print files
// aren't copied: they're already files, and nothing deletes them by accident.
import 'server-only';
import { getRepo } from './repo';

export interface BackupSummary {
  at: string;
  /** Where it was saved, inside the private storage. */
  file: string;
  /** Rows per table. */
  rows: Record<string, number>;
}

const LATEST = 'backups/latest.json';
const DAY = 86_400_000;
/** Nights of copies kept besides tonight's. */
const KEEP_DAYS = 30;
const fileFor = (d: Date) => `backups/${d.toISOString().slice(0, 10)}.json`;
/** Before copies were named by date: one for each day of the month. */
const dayFile = (day: number) => `backups/day-${String(day).padStart(2, '0')}.json`;

/** Copies past a month (and a few nights more, in case the schedule skipped some), and the old day-of-the-month ones as their day comes round. */
function expired(now: Date): string[] {
  const old = Array.from({ length: 10 }, (_, i) => fileFor(new Date(now.getTime() - (KEEP_DAYS + 1 + i) * DAY)));
  const today = now.getUTCDate();
  const lastOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  // On the last day of a short month, the days it doesn't have go too.
  for (let d = today; d <= (today === lastOfMonth ? 31 : today); d++) old.push(dayFile(d));
  return old;
}

/** What a backup file holds. `kind` says which storage it came from, since each restores into its own kind. */
export interface BackupFile {
  kind: 'supabase' | 'local';
  at: string;
  tables: Record<string, unknown[]>;
}

/** Copies every table into today's file and notes it as the latest. */
export async function backUp(now = new Date()): Promise<BackupSummary> {
  const repo = getRepo();
  const tables = await repo.exportAll();
  const at = now.toISOString();
  const file = fileFor(now);
  const body: BackupFile = { kind: repo.name === 'supabase' ? 'supabase' : 'local', at, tables };
  await repo.putAsset(file, Buffer.from(JSON.stringify(body)), 'application/json');
  const summary: BackupSummary = { at, file, rows: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, Array.isArray(rows) ? rows.length : 0])) };
  await repo.putAsset(LATEST, Buffer.from(JSON.stringify(summary)), 'application/json');
  try {
    await repo.deleteAssets(expired(now));
  } catch (e) {
    // Tonight's copy is safe; the old ones go tomorrow instead.
    console.error('Deleting old backups failed:', (e as Error).message);
  }
  return summary;
}

/** The last backup, for Setup; null if there hasn't been one. */
export async function lastBackup(): Promise<BackupSummary | null> {
  try {
    const found = await getRepo().getAsset(LATEST);
    return found ? (JSON.parse(found.data.toString('utf8')) as BackupSummary) : null;
  } catch {
    return null;
  }
}

/** Puts a backup file's tables back, row for row. Rows added since are left alone; rows in the backup are restored to how they were. */
export async function restore(file: BackupFile): Promise<void> {
  const repo = getRepo();
  const here = repo.name === 'supabase' ? 'supabase' : 'local';
  if (file.kind !== here) throw new Error(`That backup came from ${file.kind} storage, and this site uses ${here}.`);
  await repo.importAll(file.tables);
}
