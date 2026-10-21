import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalRepo } from '@/lib/server/repo/local';
import { setRepo } from '@/lib/server/repo';

/** A throwaway local repo in a temp folder. */
export function tempRepo(): { repo: LocalRepo; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
  const repo = new LocalRepo(dir);
  setRepo(repo);
  return { repo, dir };
}
