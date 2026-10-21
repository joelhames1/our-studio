// A copy of the whole database every night, kept in the same private storage
// as the artwork: backups/day-01.json to day-31.json, one for each day of the
// month, so a month of copies is always there and each night's replaces the
// one from a month before. It guards against mistakes (a project deleted by
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
  const file = `backups/day-${String(now.getUTCDate()).padStart(2, '0')}.json`;
  const body: BackupFile = { kind: repo.name === 'supabase' ? 'supabase' : 'local', at, tables };
  await repo.putAsset(file, Buffer.from(JSON.stringify(body)), 'application/json');
  const summary: BackupSummary = { at, file, rows: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, Array.isArray(rows) ? rows.length : 0])) };
  await repo.putAsset(LATEST, Buffer.from(JSON.stringify(summary)), 'application/json');
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
