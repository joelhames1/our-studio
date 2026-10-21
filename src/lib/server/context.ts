// What a request is about, for code far from the route that handles it: the
// household whose AI budget it spends. Every API route runs inside one (see
// api.ts); requireUser fills in the household you're working in, unless
// something has already said, and requireMember the project's own.
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  household?: string;
}

const store = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with a fresh context of its own. */
export function withContext<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({}, fn);
}

/** Notes whose household this request is spending for. */
export function setHousehold(id: string): void {
  const ctx = store.getStore();
  if (ctx) ctx.household = id;
}

/** The same, unless it's already known (a project's household outranks the one you happen to be working in). */
export function assumeHousehold(id: string): void {
  const ctx = store.getStore();
  if (ctx && !ctx.household) ctx.household = id;
}

/** The household this request is spending for, if it's known. */
export function currentHousehold(): string | undefined {
  return store.getStore()?.household;
}
