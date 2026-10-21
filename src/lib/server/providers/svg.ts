// Strict allow-list sanitiser for SVG artwork drawn by Claude. Anything that
// could run code, load something external, or isn't plain shapes is dropped.

const TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const ATTRS = new Set([
  'viewbox', 'xmlns', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
  'x1', 'y1', 'x2', 'y2', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'fill-rule', 'clip-rule', 'transform',
]);

/** Plenty for an illustration; anything bigger is refused rather than parsed. */
export const MAX_SVG_CHARS = 400_000;
/** Shapes, numbers and transforms: letters, digits, spaces, dots, commas, signs, brackets. */
const SAFE_VALUE = /^[\w\s.,()%+-]*$/;
/** Paint is a hex color or a plain color word ("none", "white", "currentColor"). */
const SAFE_PAINT = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

export function sanitizeSvg(input: string): string {
  if (input.length > MAX_SVG_CHARS) throw new Error('The artwork was too big.');
  const start = input.indexOf('<svg');
  const end = input.lastIndexOf('</svg>');
  if (start < 0 || end < 0) throw new Error('No SVG found in the artwork.');
  const body = input.slice(start, end + 6);
  let out = '';
  const depth: string[] = [];
  for (const m of body.matchAll(/<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^>]*?)(\/)?\s*>/g)) {
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    const selfClosing = !!m[4];
    if (!TAGS.has(tag)) continue;
    if (closing) {
      if (depth[depth.length - 1] === tag) {
        depth.pop();
        out += `</${tag}>`;
        // Nothing after the drawing itself is kept.
        if (!depth.length) break;
      }
      continue;
    }
    const attrs: string[] = [];
    for (const a of m[3].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const name = a[1].toLowerCase();
      const value = (a[3] ?? a[4] ?? '').trim();
      if (!ATTRS.has(name) || name === 'xmlns') continue;
      if (/url\(|javascript:|data:|expression|[<>&"\\]/i.test(value)) continue;
      if (!(name === 'fill' || name === 'stroke' ? SAFE_PAINT : SAFE_VALUE).test(value)) continue;
      attrs.push(`${name === 'viewbox' ? 'viewBox' : name}="${value}"`);
    }
    if (tag === 'svg') {
      if (out) continue;
      out += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">';
      depth.push('svg');
      continue;
    }
    out += `<${tag} ${attrs.join(' ')}${selfClosing ? '/>' : '>'}`;
    if (!selfClosing) depth.push(tag);
  }
  while (depth.length) out += `</${depth.pop()}>`;
  if (!out.startsWith('<svg')) throw new Error('The artwork was not valid SVG.');
  return out;
}
