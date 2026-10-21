// fal.ai: Setup's connection test sends an image fal will take, and when fal
// says no, the reason comes through in its own words rather than raw JSON.
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { falProvider } from '@/lib/server/providers/fal';

const saved = { key: process.env.FAL_KEY, model: process.env.FAL_BACKGROUND_MODEL };
let sent: { url: string; body: Record<string, unknown> }[] = [];
let answer: { status: number; body: string } = { status: 200, body: '{}' };

beforeEach(() => {
  process.env.FAL_KEY = 'fal-test-not-real';
  delete process.env.FAL_BACKGROUND_MODEL;
  sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(answer.body, { status: answer.status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of [['FAL_KEY', saved.key], ['FAL_BACKGROUND_MODEL', saved.model]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('fal.ai connection test', () => {
  it('sends an image at least as big as fal’s background remover accepts', async () => {
    answer = { status: 200, body: JSON.stringify({ image: { url: 'data:image/png;base64,iVBORw0KGgo=' } }) };
    expect(await falProvider.ping()).toMatch(/fal\.ai key works/);
    expect(sent[0].url).toBe('https://fal.run/fal-ai/birefnet');
    const uri = String(sent[0].body.image_url);
    const { width, height } = await sharp(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')).metadata();
    expect(width).toBeGreaterThanOrEqual(32);
    expect(height).toBeGreaterThanOrEqual(32);
  });

  it('says what fal said, not its whole reply', async () => {
    answer = {
      status: 422,
      body: JSON.stringify({
        detail: [{ loc: ['body', 'image_url'], msg: 'Image dimensions are too small. Minimum dimensions are 32x32 pixels.', type: 'image_too_small', ctx: { min_height: 32, min_width: 32 } }],
      }),
    };
    await expect(falProvider.ping()).rejects.toThrow('fal.ai fal-ai/birefnet failed (422): Image dimensions are too small. Minimum dimensions are 32x32 pixels.');
    answer = { status: 500, body: 'upstream timed out' };
    await expect(falProvider.ping()).rejects.toThrow('fal.ai fal-ai/birefnet failed (500): upstream timed out');
    answer = { status: 401, body: '{"detail":"Unauthorized"}' };
    await expect(falProvider.ping()).rejects.toThrow('fal.ai rejected the key. Check FAL_KEY in Setup.');
  });
});
