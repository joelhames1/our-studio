// Copies the shirt fonts out of @fontsource packages into public/fonts so both
// the browser (fetch) and the server (fs) can load the exact same files.
// The copied files are committed, so this only needs re-running when the list changes.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonts = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/design/fonts.json'), 'utf8'));
const outDir = path.join(root, 'public/fonts');
fs.mkdirSync(outDir, { recursive: true });

const licenses = new Map();
for (const f of fonts) {
  const src = path.join(root, 'node_modules/@fontsource', f.pkg, 'files', `${f.pkg}-latin-${f.weight}-${f.style}.woff`);
  if (!fs.existsSync(src)) throw new Error(`Missing font file: ${src}`);
  fs.copyFileSync(src, path.join(outDir, `${f.id}.woff`));
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
console.log(`Copied ${fonts.length} fonts to public/fonts`);
