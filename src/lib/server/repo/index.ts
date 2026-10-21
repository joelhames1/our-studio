import 'server-only';
import path from 'node:path';
import { config } from '../config';
import { LocalRepo } from './local';
import { supabaseConfigProblem, SupabaseRepo } from './supabase';
import { SetupNeeded, type Repo } from './types';

let repo: Repo | null = null;

export { SetupNeeded };

export function getRepo(): Repo {
  if (repo) return repo;
  if (config.supabaseUrl && config.supabaseKey) {
    const problem = supabaseConfigProblem(config.supabaseUrl, config.supabaseKey);
    if (problem) throw new SetupNeeded(problem);
    repo = new SupabaseRepo(config.supabaseUrl, config.supabaseKey);
  } else if (config.isVercel) {
    throw new SetupNeeded('Supabase is not connected yet, and Vercel has no permanent disk.');
  } else {
    // Laptop-only storage; keep the bundler from tracing the whole project because of it.
    repo = new LocalRepo(path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.dataDir));
  }
  return repo;
}

/** For tests. */
export function setRepo(r: Repo | null) {
  repo = r;
}

export type { Repo };
