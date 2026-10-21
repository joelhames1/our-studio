// Built-in vector artwork. Everything is drawn into a 1000 x 1000 box with solid
// fills only (no gradients, no transparency), which keeps it crisp at any print
// size and friendly to every printing method. No clip paths or ids either, so
// many designs can sit on one page without clashing.
import type { Inks, MotifId } from './types';

type Pt = [number, number];
const f = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

interface Paint {
  line: boolean;
  ink: string;
}

function paint(p: Paint, fill: string, strokeScale = 1): string {
  return p.line
    ? `fill="none" stroke="${p.ink}" stroke-width="${f(9 * strokeScale)}" stroke-linejoin="round" stroke-linecap="round"`
    : `fill="${fill}"`;
}

// --- geometry helpers ---------------------------------------------------------

/** Horizontal slice of a circle between y1 and y2, as a closed path. */
function circleBand(cx: number, cy: number, r: number, y1: number, y2: number): string {
  const top = Math.max(y1, cy - r);
  const bot = Math.min(y2, cy + r);
  if (bot <= top) return '';
  const half = (y: number) => Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
  const a = half(top);
  const b = half(bot);
  return `M${f(cx - a)} ${f(top)}L${f(cx + a)} ${f(top)}A${r} ${r} 0 0 1 ${f(cx + b)} ${f(bot)}L${f(cx - b)} ${f(bot)}A${r} ${r} 0 0 1 ${f(cx - a)} ${f(top)}Z`;
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}A${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)}A${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
}

function quadPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

function quadTangent(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function polygon(points: Pt[]): string {
  return `M${points.map(pt).join('L')}Z`;
}

/** A wavy ribbon from x0 to x1 whose top edge sits at y. */
function waveRibbon(x0: number, x1: number, y: number, thickness: number, amp: number, wavelength: number, phase = 0): string {
  const half = wavelength / 2;
  const n = Math.ceil((x1 - x0) / half);
  const step = (x1 - x0) / n;
  let top = `M${f(x0)} ${f(y)}`;
  const ctrl: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const sign = (i + phase) % 2 === 0 ? -1 : 1;
    const cx = x0 + step * (i + 0.5);
    ctrl.push([cx, y + sign * amp * 2]);
    top += `Q${f(cx)} ${f(y + sign * amp * 2)} ${f(x0 + step * (i + 1))} ${f(y)}`;
  }
  let back = `L${f(x1)} ${f(y + thickness)}`;
  for (let i = n - 1; i >= 0; i--) {
    back += `Q${f(ctrl[i][0])} ${f(ctrl[i][1] + thickness)} ${f(x0 + step * i)} ${f(y + thickness)}`;
  }
  return `${top}${back}Z`;
}

// --- primitives ---------------------------------------------------------------

/** Retro striped sun. */
function stripedSun(cx: number, cy: number, r: number, colors: string[], p: Paint): string {
  if (p.line) {
    let out = `<path d="${circle(cx, cy, r)}" ${paint(p, '')}/>`;
    for (let i = 1; i <= 4; i++) {
      const y = cy + r * (0.12 + i * 0.17);
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
      out += `<path d="M${f(cx - half)} ${f(y)}L${f(cx + half)} ${f(y)}" ${paint(p, '')}/>`;
    }
    return out;
  }
  const n = colors.length;
  const yTop = cy - r;
  const solid = n === 1 ? 0.5 : 0.42;
  const bounds: [number, number][] = [[0, solid]];
  const rest = 1 - solid;
  const bandCount = Math.max(n - 1, 4);
  for (let i = 0; i < bandCount; i++) {
    const gap = 0.022 + 0.014 * i;
    const start = solid + (rest * i) / bandCount + gap;
    const end = solid + (rest * (i + 1)) / bandCount;
    bounds.push([start, end]);
  }
  return bounds
    .map(([a, b], i) => {
      const c = colors[Math.min(i, n - 1)];
      return `<path d="${circleBand(cx, cy, r, yTop + a * 2 * r, yTop + b * 2 * r)}" fill="${c}"/>`;
    })
    .join('');
}

function waves(x0: number, x1: number, y: number, colors: string[], p: Paint, spacing = 46, thick = 30): string {
  return colors
    .map((c, i) => `<path d="${waveRibbon(x0, x1, y + i * spacing, thick, 9, 120, i)}" ${paint(p, c, 0.7)}/>`)
    .join('');
}

/** Palm tree silhouette. base = foot of the trunk; lean in units (+ = right). */
function palm(base: Pt, height: number, lean: number, color: string, p: Paint, scale = 1): string {
  const top: Pt = [base[0] + lean, base[1] - height];
  const ctrl: Pt = [base[0] + lean * 0.15, base[1] - height * 0.55];
  const w0 = 36 * scale;
  const w1 = 17 * scale;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = quadPoint(base, ctrl, top, t);
    const tan = quadTangent(base, ctrl, top, t);
    const nx = -tan[1];
    const ny = tan[0];
    const w = (w0 + (w1 - w0) * t) / 2;
    // little bumps for the trunk rings
    const bump = i % 2 === 0 ? 1 : 0.86;
    left.push([c[0] + nx * w * bump, c[1] + ny * w * bump]);
    right.push([c[0] - nx * w * bump, c[1] - ny * w * bump]);
  }
  const sw = Math.max(5, 7 * scale);
  let out = p.line
    ? `<path d="M${left.map(pt).join('L')}M${right.map(pt).join('L')}" fill="none" stroke="${p.ink}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${polygon([...left, ...right.reverse()])}" fill="${color}"/>`;

  const fronds = [-168, -140, -112, -78, -45, -14, 14];
  for (const deg of fronds) {
    const a = (deg * Math.PI) / 180;
    const len = height * 0.5 * (deg < -95 && deg > -125 ? 0.8 : 1);
    const dir: Pt = [Math.cos(a), Math.sin(a)];
    const droop = len * (0.42 - 0.25 * Math.abs(Math.sin(a)));
    const end: Pt = [top[0] + dir[0] * len, top[1] + dir[1] * len + droop];
    const mid: Pt = [top[0] + dir[0] * len * 0.55, top[1] + dir[1] * len * 0.55 - len * 0.12];
    const maxW = 56 * scale;
    const M = 16;
    if (p.line) {
      // Fishbone: a spine plus angled leaflets, which reads as "palm" in one line weight.
      let d = `M${pt(top)}Q${pt(mid)} ${pt(end)}`;
      for (let i = 2; i < M; i++) {
        const t = i / M;
        const c = quadPoint(top, mid, end, t);
        const tan = quadTangent(top, mid, end, t);
        const nx = -tan[1];
        const ny = tan[0];
        const w = maxW * 0.62 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.3 * t);
        for (const side of [1, -1]) {
          const tip: Pt = [c[0] + (nx * side + tan[0] * 0.7) * w, c[1] + (ny * side + tan[1] * 0.7) * w];
          d += `M${pt(c)}L${pt(tip)}`;
        }
      }
      out += `<path d="${d}" fill="none" stroke="${p.ink}" stroke-width="${f(sw * 0.75)}" stroke-linecap="round"/>`;
      continue;
    }
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      const c = quadPoint(top, mid, end, t);
      const tan = quadTangent(top, mid, end, t);
      const nx = -tan[1];
      const ny = tan[0];
      const w = maxW * Math.pow(Math.sin(Math.PI * Math.min(t * 1.05, 1)), 0.75) * (1 - 0.35 * t);
      const tooth = i % 2 === 0 ? 1 : 0.45;
      upper.push([c[0] + nx * w * 0.55 * tooth, c[1] + ny * w * 0.55 * tooth]);
      lower.push([c[0] - nx * w * 0.45 * tooth, c[1] - ny * w * 0.45 * tooth]);
    }
    out += `<path d="${polygon([...upper, ...lower.reverse()])}" fill="${color}"/>`;
  }
  if (!p.line) {
    out += `<path d="${circle(top[0] - 10 * scale, top[1] + 16 * scale, 13 * scale)}${circle(top[0] + 12 * scale, top[1] + 20 * scale, 12 * scale)}" fill="${color}"/>`;
  }
  return out;
}

/** Alarm clock. */
function alarmClock(cx: number, cy: number, r: number, inks: Inks, p: Paint, face?: string): string {
  const ink = p.line ? p.ink : inks.art;
  let out = '';
  // bells
  for (const side of [-1, 1]) {
    const bx = cx + side * r * 0.72;
    const by = cy - r * 0.86;
    const br = r * 0.34;
    out += `<path d="M${f(bx - br)} ${f(by)}A${f(br)} ${f(br)} 0 0 1 ${f(bx + br)} ${f(by)}Z" transform="rotate(${side * 32} ${f(bx)} ${f(by)})" ${paint(p, ink)}/>`;
  }
  // legs
  for (const side of [-1, 1]) {
    const lx = cx + side * r * 0.62;
    const ly = cy + r * 0.8;
    out += `<path d="M${f(lx)} ${f(ly)}L${f(lx + side * r * 0.22)} ${f(ly + r * 0.32)}" stroke="${ink}" stroke-width="${f(r * 0.12)}" stroke-linecap="round" fill="none"/>`;
  }
  // body ring + face
  out += `<path d="${circle(cx, cy, r)}" ${p.line ? paint(p, '') : `fill="${ink}"`}/>`;
  if (!p.line) out += `<path d="${circle(cx, cy, r * 0.84)}" fill="${face ?? inks.panel}"/>`;
  out += clockFace(cx, cy, r * 0.84, ink);
  return out;
}

/** Ticks and hands at 10:10, the classic "smiling" watch-ad time. */
function clockFace(cx: number, cy: number, r: number, ink: string, horizon = Infinity): string {
  let out = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    // Ticks below the sea line would peek between the waves.
    if (cy - Math.cos(a) * r * 0.72 > horizon) continue;
    const major = i % 3 === 0;
    const r1 = r * (major ? 0.72 : 0.8);
    const r2 = r * 0.9;
    out += `<path d="M${f(cx + Math.sin(a) * r1)} ${f(cy - Math.cos(a) * r1)}L${f(cx + Math.sin(a) * r2)} ${f(cy - Math.cos(a) * r2)}" stroke="${ink}" stroke-width="${f(r * (major ? 0.07 : 0.04))}" stroke-linecap="round"/>`;
  }
  const hand = (deg: number, len: number, w: number) => {
    const a = (deg * Math.PI) / 180;
    return `<path d="M${f(cx)} ${f(cy)}L${f(cx + Math.sin(a) * len)} ${f(cy - Math.cos(a) * len)}" stroke="${ink}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
  };
  out += hand(305, r * 0.48, r * 0.09);
  out += hand(60, r * 0.68, r * 0.065);
  out += `<path d="${circle(cx, cy, r * 0.08)}" fill="${ink}"/>`;
  return out;
}

function planeShape(): string {
  // Top-down jet pointing up, centered on 0,0, about 200 units long.
  return polygon([
    [0, -100], [9, -86], [12, -30], [95, 12], [95, 28], [12, 6], [9, 62], [36, 84], [36, 96], [0, 86],
    [-36, 96], [-36, 84], [-9, 62], [-12, 6], [-95, 28], [-95, 12], [-12, -30], [-9, -86],
  ]);
}

function bungalow(x: number, y: number, s: number, color: string, p: Paint): string {
  // x,y = left end of the deck; s = scale
  const P = (px: number, py: number): Pt => [x + px * s, y + py * s];
  let out = '';
  // roof
  out += `<path d="${polygon([P(40, -10), P(150, -95), P(260, -10)])}" ${paint(p, color)}/>`;
  // hut body
  out += `<path d="${polygon([P(70, -10), P(230, -10), P(230, 52), P(70, 52)])}" ${paint(p, color)}/>`;
  // deck
  out += `<path d="${polygon([P(-120, 52), P(300, 52), P(300, 66), P(-120, 66)])}" ${paint(p, color)}/>`;
  // stilts
  for (const sx of [-100, -30, 40, 110, 180, 260]) {
    out += `<path d="${polygon([P(sx, 66), P(sx + 10, 66), P(sx + 10, 150), P(sx, 150)])}" ${paint(p, color, 0.6)}/>`;
  }
  return out;
}

/** A balloon: a slightly egg-shaped oval with a little knot. (cx, cy) is its middle. */
function balloon(cx: number, cy: number, rx: number, ry: number, deg: number, color: string, p: Paint): string {
  const body = `M${f(cx)} ${f(cy - ry)}C${f(cx + rx * 1.33)} ${f(cy - ry)} ${f(cx + rx * 1.1)} ${f(cy + ry * 0.75)} ${f(cx)} ${f(cy + ry)}C${f(cx - rx * 1.1)} ${f(cy + ry * 0.75)} ${f(cx - rx * 1.33)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}Z`;
  const knot = polygon([[cx, cy + ry - 4], [cx + rx * 0.16, cy + ry + rx * 0.2], [cx - rx * 0.16, cy + ry + rx * 0.2]]);
  return `<g transform="rotate(${deg} ${f(cx)} ${f(cy + ry)})"><path d="${body}" ${paint(p, color)}/><path d="${knot}" ${paint(p, color)}/></g>`;
}

/** A heart, tip at the bottom. (cx, cy) is roughly its middle; s is half its width. */
function heartPath(cx: number, cy: number, s: number): string {
  return (
    `M${f(cx)} ${f(cy + s * 0.95)}` +
    `C${f(cx - s * 0.35)} ${f(cy + s * 0.6)} ${f(cx - s * 1.05)} ${f(cy + s * 0.15)} ${f(cx - s * 1.0)} ${f(cy - s * 0.35)}` +
    `C${f(cx - s * 0.95)} ${f(cy - s * 0.85)} ${f(cx - s * 0.25)} ${f(cy - s * 1.0)} ${f(cx)} ${f(cy - s * 0.5)}` +
    `C${f(cx + s * 0.25)} ${f(cy - s * 1.0)} ${f(cx + s * 0.95)} ${f(cy - s * 0.85)} ${f(cx + s * 1.0)} ${f(cy - s * 0.35)}` +
    `C${f(cx + s * 1.05)} ${f(cy + s * 0.15)} ${f(cx + s * 0.35)} ${f(cy + s * 0.6)} ${f(cx)} ${f(cy + s * 0.95)}Z`
  );
}

/** A four-pointed sparkle. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return `M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z`;
}

/** A pointed leaf, centered on 0,0 along the y axis. */
function leafPath(len: number, w: number): string {
  return `M0 ${f(-len / 2)}Q${f(w)} 0 0 ${f(len / 2)}Q${f(-w)} 0 0 ${f(-len / 2)}Z`;
}

/** One side of a laurel wreath: a curved stem with leaves in pairs. */
function laurelBranch(side: 1 | -1, color: string, p: Paint): string {
  const cx = 500;
  const cy = 500;
  const R = 330;
  const steps = 8;
  // Walk from the bottom (100°) round the side to near the top (250°), mirrored for the right.
  const at = (t: number) => {
    const deg = 100 + t * 150;
    const a = ((side === -1 ? deg : 180 - deg) * Math.PI) / 180;
    // Direction of travel, toward the tip.
    const d: Pt = side === -1 ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
    return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a, d, rot: (Math.atan2(d[1], d[0]) * 180) / Math.PI + 90 };
  };
  let stem = '';
  for (let i = 0; i <= 40; i++) {
    const q = at(i / 40);
    stem += `${i ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`;
  }
  let leaves = '';
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const q = at(t);
    const size = 1 - t * 0.3;
    const len = 130 * size;
    for (const out of [1, -1]) {
      // Leaves angle forward along the stem and splay out to either side.
      const splay = out * (side === -1 ? -1 : 1) * 34;
      const r = ((q.rot + splay) * Math.PI) / 180;
      const lx = q.x + Math.sin(r) * len * 0.45 + Math.cos(q.a) * 6 * out;
      const ly = q.y - Math.cos(r) * len * 0.45 + Math.sin(q.a) * 6 * out;
      leaves += `<path d="${leafPath(len, 40 * size)}" transform="translate(${f(lx)} ${f(ly)}) rotate(${f(q.rot + splay)})" ${paint(p, color, 0.7)}/>`;
    }
  }
  // One leaf right at the tip, pointing on.
  const tip = at(1);
  const tr = (tip.rot * Math.PI) / 180;
  leaves += `<path d="${leafPath(110, 30)}" transform="translate(${f(tip.x + Math.sin(tr) * 50)} ${f(tip.y - Math.cos(tr) * 50)}) rotate(${f(tip.rot)})" ${paint(p, color, 0.7)}/>`;
  return `<path d="${stem}" fill="none" stroke="${p.line ? p.ink : color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>${leaves}`;
}

/** A champagne flute standing on (0,0), rim at the top. */
function flute(liquid: string, glass: string, bubbles: string, p: Paint): string {
  const bowl = 'M-70 -585L70 -585L52 -300Q0 -235 -52 -300Z';
  const fill = 'M-62 -500L62 -500L48 -305Q0 -250 -48 -305Z';
  let out = '';
  if (!p.line) {
    out += `<path d="${fill}" fill="${liquid}"/>`;
    for (const [bx, by, br] of [[-18, -360, 9], [14, -400, 7], [-6, -440, 11], [20, -470, 6]] as const) out += `<path d="${circle(bx, by, br)}" fill="${bubbles}"/>`;
  }
  out += `<path d="${bowl}" fill="none" stroke="${glass}" stroke-width="14" stroke-linejoin="round"/>`;
  out += `<path d="M0 -262L0 -20" stroke="${glass}" stroke-width="16" stroke-linecap="round"/>`;
  out += `<path d="M-95 0Q0 -42 95 0Z" ${paint(p, glass)}/>`;
  return out;
}

// --- scenes -------------------------------------------------------------------

export interface MotifOptions {
  line?: boolean;
}

export function motifSvg(id: MotifId, inks: Inks, opts: MotifOptions = {}): string {
  const p: Paint = { line: !!opts.line, ink: inks.art };
  switch (id) {
    case 'none':
      return '';
    case 'sunset':
      return stripedSun(500, 470, 400, inks.sun, p) + waves(90, 910, 760, inks.water.slice(0, 3), p);
    case 'sunset-palm':
      return (
        stripedSun(520, 450, 380, inks.sun, p) +
        waves(110, 930, 720, inks.water.slice(0, 3), p) +
        palm([300, 900], 600, 130, inks.art, p)
      );
    case 'sunset-clock': {
      // The sun is a clock, setting into the sea.
      let out = stripedSun(500, 470, 370, inks.sun, p);
      out += clockFace(500, 470, 370, p.line ? p.ink : inks.art, 680);
      out += waves(90, 910, 690, inks.water.slice(0, 3), p, 48, 34);
      return out;
    }
    case 'clock':
      return alarmClock(500, 520, 330, inks, p, inks.sun[0]);
    case 'hourglass-island': {
      const ink = p.line ? p.ink : inks.art;
      let out = '';
      // sand in the top bulb
      out += `<path d="M335 260Q500 250 665 260L520 470L480 470Z" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)])}/>`;
      // falling sand
      out += `<path d="M500 470L500 640" stroke="${inks.sun[Math.min(1, inks.sun.length - 1)]}" stroke-width="10" stroke-dasharray="4 14" stroke-linecap="round"/>`;
      // sea + island in the bottom bulb
      out += `<path d="${waveRibbon(300, 700, 745, 70, 6, 90)}" ${paint(p, inks.water[0], 0.7)}/>`;
      out += `<path d="M380 760Q500 650 620 760Z" ${paint(p, inks.sun[0])}/>`;
      out += palm([510, 730], 150, 30, inks.art, p, 0.3);
      // glass
      out += `<path d="M300 170C300 380 470 430 470 500C470 570 300 620 300 830M700 170C700 380 530 430 530 500C530 570 700 620 700 830" fill="none" stroke="${ink}" stroke-width="20" stroke-linecap="round"/>`;
      // frame
      out += `<path d="M230 120L770 120Q790 120 790 140L790 170L210 170L210 140Q210 120 230 120Z" fill="${ink}"/>`;
      out += `<path d="M210 830L790 830L790 860Q790 880 770 880L230 880Q210 880 210 860Z" fill="${ink}"/>`;
      out += `<path d="M240 170L262 170L262 830L240 830ZM738 170L760 170L760 830L738 830Z" fill="${ink}"/>`;
      return out;
    }
    case 'bungalow-sunset':
      return (
        stripedSun(560, 430, 340, inks.sun, p) +
        bungalow(330, 600, 1.05, inks.art, p) +
        waves(80, 920, 760, inks.water.slice(0, 3), p)
      );
    case 'plane-sun': {
      const ink = p.line ? p.ink : inks.art;
      let out = `<path d="${circle(610, 420, 260)}" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)])}/>`;
      out += `<path d="M120 860Q260 520 640 560" fill="none" stroke="${ink}" stroke-width="14" stroke-dasharray="2 34" stroke-linecap="round"/>`;
      out += `<path d="${planeShape()}" transform="translate(735 545) rotate(78) scale(1.25)" fill="${ink}"/>`;
      out += `<path d="${circle(120, 860, 18)}" fill="${ink}"/>`;
      return out;
    }
    case 'palm-duo':
      // Two palms on one little island. Subtle, but it's the two of you.
      return (
        `<path d="${circle(500, 450, 290)}" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)])}/>` +
        palm([440, 860], 560, -150, inks.art, p, 0.92) +
        palm([560, 860], 500, 140, inks.art, p, 0.88) +
        `<path d="M200 900Q500 760 800 900Z" ${paint(p, inks.sun[0])}/>`
      );
    case 'sun-rays': {
      let out = '';
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a0 = (2 * Math.PI * i) / n;
        const a1 = a0 + Math.PI / n;
        const R = 480;
        out += `<path d="M500 500L${f(500 + Math.cos(a0) * R)} ${f(500 + Math.sin(a0) * R)}L${f(500 + Math.cos(a1) * R)} ${f(500 + Math.sin(a1) * R)}Z" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)], 0.5)}/>`;
      }
      out += `<path d="${circle(500, 500, 190)}" ${paint(p, inks.sun[0])}/>`;
      return out;
    }
    case 'balloons': {
      const ink = p.line ? p.ink : inks.art;
      const gather: Pt = [470, 930];
      const list: [number, number, number, number, number, string][] = [
        [300, 370, 135, 165, -14, inks.accent],
        [690, 400, 130, 160, 13, inks.water[0]],
        [500, 270, 150, 185, 0, inks.sun[Math.min(1, inks.sun.length - 1)]],
      ];
      let strings = '';
      for (const [cx, cy, , ry, deg] of list) {
        const a = (deg * Math.PI) / 180;
        const kx = cx - Math.sin(a) * 0;
        const ky = cy + ry + 22;
        const end: Pt = [kx + Math.sin(a) * -20, ky];
        strings += `M${pt(end)}Q${f((end[0] + gather[0]) / 2 + (cx < 500 ? -40 : 40))} ${f((end[1] + gather[1]) / 2)} ${pt(gather)}`;
      }
      let out = `<path d="${strings}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
      for (const [cx, cy, rx, ry, deg, color] of list) out += balloon(cx, cy, rx, ry, deg, color, p);
      // A little bow where the strings meet.
      out += `<path d="${polygon([[gather[0], gather[1]], [gather[0] - 46, gather[1] - 26], [gather[0] - 46, gather[1] + 26]])}${polygon([[gather[0], gather[1]], [gather[0] + 46, gather[1] - 26], [gather[0] + 46, gather[1] + 26]])}" ${paint(p, inks.accent)}/>`;
      return out;
    }
    case 'cake': {
      const ink = p.line ? p.ink : inks.art;
      let out = '';
      // plate
      out += `<path d="M170 846Q500 880 830 846L830 866Q500 900 170 866Z" ${paint(p, ink)}/>`;
      // tiers
      out += `<path d="M230 600Q230 580 250 580L750 580Q770 580 770 600L770 846L230 846Z" ${paint(p, ink)}/>`;
      out += `<path d="M330 410Q330 392 348 392L652 392Q670 392 670 410L670 580L330 580Z" ${paint(p, inks.water[0])}/>`;
      // icing drips on both tiers
      const drips = (x0: number, x1: number, y: number, n: number, depth: number) => {
        const w = (x1 - x0) / n;
        let d = `M${x0} ${y - 14}L${x1} ${y - 14}L${x1} ${y}`;
        for (let i = n - 1; i >= 0; i--) {
          const l = x0 + i * w;
          const dd = depth * (i % 2 ? 0.55 : 1) * (i % 3 === 1 ? 0.8 : 1);
          d += `L${f(l + w)} ${f(y + dd - w / 2)}A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(l)} ${f(y + dd - w / 2)}`;
        }
        return d + 'Z';
      };
      out += `<path d="${drips(230, 770, 594, 9, 78)}" ${paint(p, inks.accent)}/>`;
      out += `<path d="${drips(330, 670, 404, 6, 64)}" ${paint(p, inks.sun[0])}/>`;
      // sprinkles on the bottom tier
      if (!p.line) {
        const dots: [number, number][] = [[300, 740], [380, 790], [470, 720], [560, 780], [650, 730], [710, 800], [420, 810], [600, 690]];
        for (const [x, y] of dots) out += `<path d="M${x - 12} ${y}L${x + 12} ${y - 6}" stroke="${inks.sun[Math.min(1, inks.sun.length - 1)]}" stroke-width="10" stroke-linecap="round"/>`;
      }
      // candles and flames
      for (const x of [410, 500, 590]) {
        out += `<path d="M${x - 13} 392L${x - 13} 250Q${x - 13} 240 ${x - 3} 240L${x + 3} 240Q${x + 13} 240 ${x + 13} 250L${x + 13} 392Z" ${paint(p, inks.accent2)}/>`;
        out += `<path d="M${x} 150Q${x + 34} 196 ${x} 226Q${x - 34} 196 ${x} 150Z" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)])}/>`;
      }
      return out;
    }
    case 'grad-cap': {
      const ink = p.line ? p.ink : inks.art;
      let out = '';
      // the cap under the board
      out += `<path d="M285 395L285 555Q500 650 715 555L715 395Z" ${paint(p, ink)}/>`;
      // the board
      out += `<path d="${polygon([[90, 330], [500, 170], [910, 330], [500, 490]])}" ${paint(p, ink)}/>`;
      if (!p.line) out += `<path d="${polygon([[150, 330], [500, 196], [850, 330], [500, 464]])}" fill="none" stroke="${inks.accent2}" stroke-width="6" stroke-opacity="1"/>`;
      // tassel
      const t = inks.sun[Math.min(1, inks.sun.length - 1)];
      out += `<path d="M500 330L800 360L800 520" fill="none" stroke="${p.line ? p.ink : t}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
      out += `<path d="M778 520L822 520L840 640L760 640Z" ${paint(p, t)}/>`;
      out += `<path d="${circle(500, 330, 22)}" ${paint(p, t)}/>`;
      // a rolled diploma with a ribbon
      out += `<g transform="rotate(-8 500 760)">`;
      out += `<path d="M250 722L750 722L750 798L250 798Z" ${paint(p, inks.sun[0])}/>`;
      out += `<path d="${circle(250, 760, 38)}" ${paint(p, inks.sun[0])}/>`;
      out += `<path d="${circle(750, 760, 38)}" ${paint(p, inks.sun[0])}/>`;
      out += `<path d="${circle(750, 760, 16)}" ${paint(p, ink)}/>`;
      out += `<path d="M470 716L530 716L530 804L470 804Z" ${paint(p, inks.accent)}/>`;
      out += `<path d="M480 804L450 880L486 862L500 890L514 862L550 880L520 804Z" ${paint(p, inks.accent)}/>`;
      out += '</g>';
      return out;
    }
    case 'laurel': {
      const leaf = p.line ? p.ink : inks.art;
      let out = laurelBranch(-1, leaf, p) + laurelBranch(1, leaf, p);
      // a ribbon tying the stems
      out += `<path d="M500 836L430 800L436 880ZM500 836L570 800L564 880Z" ${paint(p, inks.accent)}/>`;
      out += `<path d="${circle(500, 836, 24)}" ${paint(p, inks.accent)}/>`;
      // a star in the middle
      const star: Pt[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 78 : 170;
        star.push([500 + Math.cos(a) * r, 500 + Math.sin(a) * r]);
      }
      out += `<path d="${polygon(star)}" ${paint(p, inks.sun[Math.min(1, inks.sun.length - 1)])}/>`;
      return out;
    }
    case 'hearts': {
      const ink = p.line ? p.ink : inks.art;
      let out = '';
      out += `<path d="${heartPath(400, 470, 250)}" transform="rotate(-12 400 470)" ${paint(p, inks.accent)}/>`;
      out += `<path d="${heartPath(620, 560, 210)}" transform="rotate(14 620 560)" ${p.line ? paint(p, '') : `fill="${inks.sun[Math.min(1, inks.sun.length - 1)]}" stroke="${ink}" stroke-width="14" stroke-linejoin="round"`}/>`;
      out += `<path d="${sparkle(190, 200, 56)}${sparkle(820, 250, 40)}${sparkle(800, 840, 48)}" ${paint(p, inks.sun[0], 0.6)}/>`;
      return out;
    }
    case 'champagne': {
      const ink = p.line ? p.ink : inks.art;
      const liquid = inks.sun[0];
      const bubbles = inks.sun[Math.min(1, inks.sun.length - 1)];
      let out = '';
      // Tilted just enough that the rims touch.
      out += `<g transform="translate(330 900) rotate(10)">${flute(liquid, ink, bubbles, p)}</g>`;
      out += `<g transform="translate(670 900) rotate(-10)">${flute(liquid, ink, bubbles, p)}</g>`;
      // the clink
      for (const deg of [-150, -120, -90, -60, -30]) {
        const a = (deg * Math.PI) / 180;
        const r1 = 70;
        const r2 = 150;
        out += `<path d="M${f(500 + Math.cos(a) * r1)} ${f(250 + Math.sin(a) * r1)}L${f(500 + Math.cos(a) * r2)} ${f(250 + Math.sin(a) * r2)}" stroke="${p.line ? p.ink : inks.accent}" stroke-width="14" stroke-linecap="round"/>`;
      }
      out += `<path d="${sparkle(200, 200, 44)}${sparkle(810, 170, 36)}" ${paint(p, inks.accent, 0.6)}/>`;
      return out;
    }
    case 'confetti': {
      const colors = [inks.accent, inks.water[0], inks.sun[Math.min(1, inks.sun.length - 1)], inks.accent2, inks.art];
      let out = '';
      // a burst in the middle
      const burst: Pt[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        const r = i % 2 ? 150 : 270;
        burst.push([500 + Math.cos(a) * r, 500 + Math.sin(a) * r]);
      }
      out += `<path d="${polygon(burst)}" ${paint(p, inks.sun[0])}/>`;
      // confetti, scattered the same way every time
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      for (let i = 0; i < 34; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 300 + rnd() * 170;
        const x = 500 + Math.cos(a) * r;
        const y = 500 + Math.sin(a) * r * 0.92;
        const c = colors[i % colors.length];
        const rot = f(rnd() * 180);
        const kind = i % 3;
        if (kind === 0) out += `<path d="M${f(x - 22)} ${f(y - 9)}L${f(x + 22)} ${f(y - 9)}L${f(x + 22)} ${f(y + 9)}L${f(x - 22)} ${f(y + 9)}Z" transform="rotate(${rot} ${f(x)} ${f(y)})" ${paint(p, c, 0.5)}/>`;
        else if (kind === 1) out += `<path d="${circle(x, y, 13)}" ${paint(p, c, 0.5)}/>`;
        else out += `<path d="M${f(x - 30)} ${f(y)}Q${f(x - 15)} ${f(y - 22)} ${f(x)} ${f(y)}T${f(x + 30)} ${f(y)}" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="none" stroke="${p.line ? p.ink : c}" stroke-width="10" stroke-linecap="round"/>`;
      }
      return out;
    }
  }
}

export const MOTIF_NAMES: Record<MotifId, string> = {
  none: 'No artwork',
  sunset: 'Retro sunset',
  'sunset-palm': 'Palm at sunset',
  'sunset-clock': 'The sun is a clock',
  clock: 'Alarm clock',
  'hourglass-island': 'Island in an hourglass',
  'bungalow-sunset': 'Overwater villa',
  'plane-sun': 'Jet to the sun',
  'palm-duo': 'Two palms',
  'sun-rays': 'Sunburst',
  balloons: 'Balloons',
  cake: 'Birthday cake',
  'grad-cap': 'Graduation cap',
  laurel: 'Laurel wreath',
  hearts: 'Two hearts',
  champagne: 'Champagne toast',
  confetti: 'Confetti',
};
