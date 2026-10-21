// The browser keeps each shirt font for a year at /fonts/<id>.woff?v=<hash>,
// so the hash has to match the file: change a font without re-running
// scripts/copy-fonts.mjs and phones would keep the old one.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fonts from '@/lib/design/fonts.json';
import versions from '@/lib/design/font-versions.json';

describe('font versions', () => {
  it('match the files the browser downloads', () => {
    const actual = Object.fromEntries(
      fonts.map((f) => [f.id, createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), 'public/fonts', `${f.id}.woff`))).digest('hex').slice(0, 10)]),
    );
    expect(versions).toEqual(actual);
  });
});
