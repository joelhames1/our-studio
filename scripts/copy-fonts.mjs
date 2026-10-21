// Copies the shirt fonts out of @fontsource packages into public/fonts so both
// the browser (fetch) and the server (fs) can load the exact same files, and
// notes a short hash of each in src/lib/design/font-versions.json: the browser
// asks for /fonts/<id>.woff?v=<hash>, so it can keep them for a year and still
// get a changed one straight away. The copied files are committed, so this only
// needs re-running when the list changes (a test fails if it's forgotten).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonts = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/design/fonts.json'), 'utf8'));
const outDir = path.join(root, 'public/fonts');
fs.mkdirSync(outDir, { recursive: true });

const licenses = new Map();
const versions = {};
for (const f of fonts) {
  const src = path.join(root, 'node_modules/@fontsource', f.pkg, 'files', `${f.pkg}-latin-${f.weight}-${f.style}.woff`);
  if (!fs.existsSync(src)) throw new Error(`Missing font file: ${src}`);
  fs.copyFileSync(src, path.join(outDir, `${f.id}.woff`));
  versions[f.id] = createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 10);
  const lic = path.join(root, 'node_modules/@fontsource', f.pkg, 'LICENSE');
  if (fs.existsSync(lic)) licenses.set(f.family, fs.readFileSync(lic, 'utf8').trim());
}

const notice = [
  'Shirt fonts bundled with this app. All are open-licensed (SIL Open Font License or Apache 2.0),',
  'which allows using them in printed designs. Sourced from Google Fonts via Fontsource.',
  '',
  ...[...licenses.entries()].flatMap(([family, text]) => [`==== ${family} ====`, text, '']),
].join('\n');
fs.writeFileSync(path.join(outDir, 'LICENSES.txt'), notice);
fs.writeFileSync(path.join(root, 'src/lib/design/font-versions.json'), `${JSON.stringify(versions, null, 2)}\n`);
console.log(`Copied ${fonts.length} fonts to public/fonts`);
