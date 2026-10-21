import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'opentype.js';
import fontList from '@/lib/design/fonts.json';
import type { FontSet } from '@/lib/design/types';

let cache: Promise<FontSet> | null = null;

export function fontDir(): string {
  return path.join(process.cwd(), 'public', 'fonts');
}

/** Loads every shirt font from disk once per server process. */
export function loadAllFonts(): Promise<FontSet> {
  if (!cache) {
    cache = (async () => {
      const set: FontSet = {};
      await Promise.all(
        fontList.map(async (f) => {
          const buf = await fs.readFile(path.join(fontDir(), `${f.id}.woff`));
          set[f.id] = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        }),
      );
      return set;
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}
