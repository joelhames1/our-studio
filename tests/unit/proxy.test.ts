// Which requests get the page policy from src/proxy.ts. Its own file: Next's
// testing helper patches console.error in a way other tests here trip over.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { config as proxyConfig } from '@/proxy';

describe('page policy coverage', () => {
  const runs = (url: string, headers?: Record<string, string>) => unstable_doesMiddlewareMatch({ config: proxyConfig, url, headers });

  it('leaves printer-link files their own stricter policy', () => {
    expect(runs('/s/abc123/f/0')).toBe(false);
    expect(runs('/s/abc123')).toBe(true);
    expect(runs('/api/projects')).toBe(false);
  });

  it('still covers a page the browser prefetches, but not the app’s own data requests', () => {
    expect(runs('/p/abc', { purpose: 'prefetch' })).toBe(true);
    expect(runs('/p/abc', { 'next-router-prefetch': '1' })).toBe(false);
  });
});
