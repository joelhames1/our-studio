// Claude does the "brain" work: word ideas, reading plain-English tweaks,
// writing art prompts, checking artwork for stray lettering, and drawing
// vector art when no image service is connected.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config, DEFAULT_MODEL } from '../config';
import { reserveSpend, type Trouble } from '../spend';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!config.anthropicKey) throw new Error('Claude is not connected (no ANTHROPIC_API_KEY).');
  client ??= new Anthropic({ apiKey: config.anthropicKey, timeout: 120_000, maxRetries: 2 });
  return client;
}

/** $ per million tokens [input, output]. Unknown models assume Opus pricing. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-1': [10, 50],
};

type Content = Anthropic.Beta.BetaContentBlockParam[] | string;

/** A generous guess at input tokens: about 3 characters each, plus the schema and images. */
function inputEstimate(system: string, content: Content): number {
  const blocks = typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
  let chars = system.length;
  let tokens = 1500;
  for (const b of blocks) {
    if (b.type === 'text') chars += b.text.length;
    else if (b.type === 'image') tokens += 1600;
    else chars += JSON.stringify(b).length;
  }
  return tokens + Math.ceil(chars / 3);
}

/** Claude couldn't do it, for a reason worth showing as is. */
export class ClaudeFailed extends Error {}
export class ClaudeDeclined extends ClaudeFailed {}

/** Why a call to Claude failed, in words, or null if it wasn't Claude. */
export function claudeProblem(e: unknown): string | null {
  if (e instanceof ClaudeFailed) return e.message;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'Claude took too long to answer. Try again in a moment.';
  if (e instanceof Anthropic.APIConnectionError) return 'Couldn’t reach Claude. Try again in a moment.';
  if (!(e instanceof Anthropic.APIError)) return null;
  const said = String((e.error as { error?: { message?: unknown } } | undefined)?.error?.message ?? e.message).slice(0, 300);
  if (e.status === 401) return 'Claude didn’t accept the API key. Check ANTHROPIC_API_KEY in Vercel, then redeploy.';
  const model = /^model: (.+)$/.exec(said)?.[1];
  if (model) {
    return `Claude doesn’t know a model called “${model}”. Fix ANTHROPIC_MODEL in Vercel (or delete it to use ${DEFAULT_MODEL}), then redeploy.`;
  }
  if (e.status === 429) return 'Claude’s rate limit was hit. Try again in a minute.';
  if (e.status === 529 || /overloaded/i.test(said)) return 'Claude is overloaded right now. Try again in a few minutes.';
  return `Claude said: ${said}`;
}

/** What to record about a failed call, so Setup can tell a broken setup from a busy moment. A refusal isn't a fault. */
export function claudeTrouble(e: unknown): Trouble | undefined {
  if (e instanceof ClaudeDeclined) return undefined;
  const message = (claudeProblem(e) ?? `Something unexpected went wrong: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300);
  const status = e instanceof Anthropic.APIError ? e.status : undefined;
  const transient = e instanceof ClaudeFailed || e instanceof Anthropic.APIConnectionError || status === 429 || (status !== undefined && status >= 500);
  return { message, transient };
}

/** A generous guess at how fast Claude writes, for what a call cut off partway probably cost. */
const TOKENS_PER_SECOND = 100;

/**
 * One structured request. Uses structured outputs (forced tool choice isn't
 * available on current models) and opts into server-side refusal fallbacks.
 * `deadlineMs` is the whole call, retries included: set it so whatever calls
 * this still has time to fall back (keywords for a tweak, templates for art
 * direction) before its route runs out of time.
 */
export async function ask<T extends z.ZodType>(
  schema: T,
  opts: { system: string; content: Content; effort?: 'low' | 'medium' | 'high'; maxTokens?: number; note: string; deadlineMs?: number },
): Promise<z.infer<T>> {
  const model = config.anthropicModel;
  const claude = anthropic();
  const maxTokens = opts.maxTokens ?? 16000;
  const deadlineMs = opts.deadlineMs ?? 90_000;
  // Hold the most this call could cost before sending it; settle once Claude answers.
  const [holdIn, holdOut] = PRICES[model] ?? PRICES['claude-opus-5-5'];
  const inputCost = (inputEstimate(opts.system, opts.content) * holdIn) / 1_000_000;
  const holdUsd = inputCost + (maxTokens * holdOut) / 1_000_000;
  const settle = await reserveSpend('anthropic', model, holdUsd, opts.note);
  const started = Date.now();
  const signal = AbortSignal.timeout(deadlineMs);
  let res;
  try {
    res = await claude.beta.messages.parse(
      {
        model,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: opts.system,
        output_config: { format: betaZodOutputFormat(schema), effort: opts.effort ?? 'medium' },
        messages: [{ role: 'user', content: opts.content }],
      },
      { signal, timeout: deadlineMs },
    );
  } catch (e) {
    if (signal.aborted) {
      // Cut off: count what it could have written in the time it had, not the worst case.
      const wrote = ((Date.now() - started) / 1000) * TOKENS_PER_SECOND;
      await settle(Math.min(holdUsd, inputCost + (wrote * holdOut) / 1_000_000), { message: 'Claude took too long to answer.', transient: true });
      throw new ClaudeFailed('Claude took too long that time. Try again in a moment.');
    }
    await settle(0, claudeTrouble(e));
    throw e;
  }
  const [inRate, outRate] = PRICES[res.model] ?? PRICES[model] ?? PRICES['claude-opus-5-5'];
  const usage = res.usage;
  const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) * 0.1;
  await settle((inputTokens * inRate + (usage.output_tokens ?? 0) * outRate) / 1_000_000);
  if (res.stop_reason === 'refusal') throw new ClaudeDeclined('Claude declined that one. Try wording it differently.');
  if (res.stop_reason === 'max_tokens') throw new ClaudeFailed('Claude ran out of room on that answer.');
  if (!res.parsed_output) throw new ClaudeFailed('Claude sent back something unexpected.');
  return res.parsed_output as z.infer<T>;
}

/** What a response cost: tokens at the serving model's price, plus a cent per web search. */
function costOf(res: Anthropic.Beta.BetaMessage, model: string): number {
  const [inRate, outRate] = PRICES[res.model] ?? PRICES[model] ?? PRICES['claude-opus-5-5'];
  const u = res.usage;
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) * 0.1;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (input * inRate + (u.output_tokens ?? 0) * outRate) / 1_000_000 + searches * 0.01;
}

/**
 * A request that can search the web and read pages before answering. Claude
 * hands back its answer by calling `tool` (a strict schema, so the answer is
 * always well formed). `holdUsd` is held against the budget up front, since
 * search results make the real cost hard to predict, and the search stops
 * before starting another turn once it has spent that much; `maxSearches` is
 * for the whole search, not each turn. The actual tokens and searches are
 * recorded afterwards, and a turn cut off mid-answer counts as the whole hold
 * (it may well have been billed).
 */
export async function research<T>(opts: {
  system: string;
  content: string;
  note: string;
  tool: { name: string; description: string; input_schema: Anthropic.Beta.BetaTool.InputSchema };
  maxSearches: number;
  holdUsd: number;
  effort?: 'low' | 'medium' | 'high';
  /** Give up after this long, so the answer comes back before the server's own time limit. */
  withinMs: number;
}): Promise<T> {
  const model = config.anthropicModel;
  const claude = anthropic();
  const settle = await reserveSpend('anthropic', model, opts.holdUsd, opts.note);
  const deadline = Date.now() + opts.withinMs;
  let spent = 0;
  let searched = 0;
  let fetched = 0;
  let trouble: Trouble | undefined;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.content }];
  try {
    // A long search can pause partway (pause_turn); resending picks it up again.
    for (let turn = 0; turn < 6; turn++) {
      const left = deadline - Date.now();
      if (left < 10_000) throw new ClaudeFailed('The search ran out of time. Try again?');
      if (spent >= opts.holdUsd) throw new ClaudeFailed('The search was taking a lot of reading, so it stopped there. Try again?');
      // Searches and page reads are shared across turns: once they're used up, Claude only has the answer tool left.
      const web: Anthropic.Beta.BetaToolUnion[] = [];
      if (searched < opts.maxSearches) web.push({ type: 'web_search_20260209', name: 'web_search', max_uses: opts.maxSearches - searched });
      if (fetched < opts.maxSearches) web.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: opts.maxSearches - fetched, max_content_tokens: 12000 });
      // No automatic retries: a retried search runs (and bills) every search again.
      const res = await claude.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: opts.system,
        output_config: { effort: opts.effort ?? 'medium' },
        tools: [...web, { ...opts.tool, strict: true }],
        messages,
      }, { timeout: left, maxRetries: 0 });
      spent += costOf(res, model);
      searched += res.usage.server_tool_use?.web_search_requests ?? 0;
      fetched += res.usage.server_tool_use?.web_fetch_requests ?? 0;
      if (res.stop_reason === 'refusal') throw new ClaudeDeclined('Claude declined that one. Try again in a moment.');
      const answer = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === opts.tool.name);
      if (answer) return answer.input as T;
      if (res.stop_reason === 'max_tokens') throw new ClaudeFailed('Claude ran out of room on that answer.');
      messages.push({ role: 'assistant', content: res.content });
      // Finished talking without handing the answer back: ask for it once more.
      if (res.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: `Now call ${opts.tool.name} with what you found.` });
    }
    throw new ClaudeFailed('Claude didn’t finish the search. Try again?');
  } catch (e) {
    trouble = claudeTrouble(e);
    // Cut off mid-turn: Anthropic may have done (and billed) the work anyway, so count the hold rather than nothing.
    if (e instanceof Anthropic.APIConnectionError) spent = Math.max(spent, opts.holdUsd);
    throw e;
  } finally {
    await settle(spent, trouble);
  }
}

export function imageBlock(png: Buffer, mediaType: 'image/png' | 'image/jpeg' = 'image/png'): Anthropic.Beta.BetaImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: png.toString('base64') } };
}

export { z };
