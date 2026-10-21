import { sendAlert } from './alerts';
import { HttpError } from './auth';
import { withContext } from './context';
import { claudeProblem } from './llm/claude';
import { SetupNeeded } from './repo';

type Ctx<P> = { params: Promise<P> };

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const MAX_BODY = 256 * 1024;

/**
 * Writes must come from the app's own pages. Browsers label every request
 * with where it came from (Sec-Fetch-Site, or Origin on older ones), so a
 * page on another site can't make a signed-in phone change anything here.
 * A request with neither label isn't from a browser, so it can only carry a
 * cookie its sender already has.
 */
export function fromOwnSite(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Wraps a route handler: JSON out, friendly errors, no stack traces to the phone. Each request gets its own context (context.ts). */
export function api<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<unknown>) {
  return (req: Request, ctx: Ctx<P>): Promise<Response> => withContext(() => handle(fn, req, ctx));
}

async function handle<P>(fn: (req: Request, params: P) => Promise<unknown>, req: Request, ctx: Ctx<P>): Promise<Response> {
  try {
    if (!READS.has(req.method) && !fromOwnSite(req)) throw new HttpError(403, 'That request came from somewhere else.');
    const out = await fn(req, await ctx.params);
    if (out instanceof Response) return out;
    return Response.json(out ?? { ok: true }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    if (e instanceof SetupNeeded) return Response.json({ error: e.message, setup: true }, { status: 503, headers: NO_STORE });
    console.error(e);
    const where = `${req.method} ${new URL(req.url).pathname}`;
    const why = e instanceof Error ? e.message : String(e);
    const claude = claudeProblem(e);
    if (claude) {
      await sendAlert('ai', [`Claude refused a request (${where}).`, `What it said: ${claude}`]);
      return Response.json({ error: claude }, { status: 502, headers: NO_STORE });
    }
    await sendAlert('server', [`A request failed with an error nobody planned for (${where}).`, `Error: ${why}`]);
    return Response.json({ error: 'Something went sideways. Try again in a moment.' }, { status: 500, headers: NO_STORE });
  }
}

/** The JSON body. Anything else (a form post from another site, say) is refused. */
export async function body<T>(req: Request): Promise<T> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) throw new HttpError(415, 'Bad request.');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'That’s too much in one go.');
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new HttpError(400, 'Bad request.');
  }
  if (text.length > MAX_BODY) throw new HttpError(413, 'That’s too much in one go.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Bad request.');
  }
}
