// Knowing when an AI service is broken. Features fall back quietly when Claude
// fails, so the failures are recorded and shown to the admin instead.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempRepo } from './helpers';
import { ago, aiTrouble, imageTrouble } from '@/lib/server/health';
import { reserveSpend } from '@/lib/server/spend';
import { testConnection } from '@/lib/server/setup';

const call = async (provider: string, trouble?: { message: string; transient: boolean }) => {
  const settle = await reserveSpend(provider, 'model', 0.01, 'word ideas');
  await settle(trouble ? 0 : 0.01, trouble);
};
const lasting = { message: 'Claude didn’t accept the API key.', transient: false };
const busy = { message: 'Claude is overloaded right now.', transient: true };

describe('which services need attention', () => {
  it('flags a failure that won’t fix itself, until a call works again', async () => {
    tempRepo();
    await call('anthropic');
    expect(await aiTrouble()).toEqual([]);

    await call('anthropic', lasting);
    // A call still running doesn't count either way.
    await reserveSpend('anthropic', 'model', 0.01, 'tweak');
    expect(await aiTrouble()).toEqual([
      expect.objectContaining({ provider: 'anthropic', label: 'Claude', note: 'word ideas', message: lasting.message, effect: expect.stringMatching(/backups/) }),
    ]);

    await call('anthropic');
    expect(await aiTrouble()).toEqual([]);
  });

  it('lets one busy moment pass, but not three in a row', async () => {
    tempRepo();
    await call('anthropic');
    await call('anthropic', busy);
    await call('anthropic', busy);
    expect(await aiTrouble()).toEqual([]);
    await call('anthropic', busy);
    expect((await aiTrouble()).map((t) => t.message)).toEqual([busy.message]);
  });

  it('keeps services apart, and ignores the practice artist', async () => {
    tempRepo();
    await call('anthropic');
    await call('fal', imageTrouble(new Error('fal.ai rejected the key. Check FAL_KEY in Setup.')));
    await call('mock', lasting);
    expect((await aiTrouble()).map((t) => [t.provider, t.label])).toEqual([['fal', 'AI artwork']]);
  });

  it('tells a broken artwork key from a busy artwork service', () => {
    expect(imageTrouble(new Error('fal.ai rejected the key. Check FAL_KEY in Setup.')).transient).toBe(false);
    expect(imageTrouble(new Error('fal.ai fal-ai/flux failed (404): no such model')).transient).toBe(false);
    expect(imageTrouble(new Error('fal.ai fal-ai/flux failed (503): try later')).transient).toBe(true);
    expect(imageTrouble(new Error('fal.ai fal-ai/flux failed (422): prompt rejected')).transient).toBe(true);
  });

  it('says when, without time zones', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(ago('2026-10-17T11:59:40Z', now)).toBe('just now');
    expect(ago('2026-10-17T11:55:00Z', now)).toBe('5 minutes ago');
    expect(ago('2026-10-17T09:00:00Z', now)).toBe('3 hours ago');
    expect(ago('2026-10-15T12:00:00Z', now)).toBe('2 days ago');
  });
});

// A stand-in for the Claude API, to fail and then work the way the real one does.
let replies: { status: number; body: object }[] = [];
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const next = replies.shift() ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'no reply queued' } } };
      res.statusCode = next.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
});
afterAll(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  return new Promise<void>((r) => server.close(() => r()));
});

describe('a real Claude call', () => {
  it('records why it failed, and the Setup test clears it once it works', async () => {
    tempRepo();
    replies = [{ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: CLAUDE-OPUS-5-6' } } }];
    await expect(testConnection('claude')).rejects.toThrow();
    const [trouble] = await aiTrouble();
    expect(trouble).toMatchObject({ provider: 'anthropic', note: 'connection test' });
    expect(trouble.message).toMatch(/doesn’t know a model called “CLAUDE-OPUS-5-6”/);

    replies = [
      {
        status: 200,
        body: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: '{"reply":"Hi Joel and Erin!"}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 10 },
        },
      },
    ];
    expect(await testConnection('claude')).toMatch(/Hi Joel and Erin/);
    expect(await aiTrouble()).toEqual([]);
  });
});
