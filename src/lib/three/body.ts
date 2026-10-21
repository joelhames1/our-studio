// Mannequin proportions and the surface maths shared by bodies and garments.
// Units are meters, y is up, the body faces +z (towards the camera), so the
// wearer's left is +x. A 12" print is 0.305 m wide, same as in real life.

export type FitId = 'erin' | 'joel';

/** A horizontal slice through the torso: half-width and front/back depth. */
export interface Section {
  y: number;
  a: number;
  f: number;
  b: number;
}

export interface BodyProfile {
  id: FitId;
  label: string;
  /** Torso slices from below the hips up to the base of the neck. */
  rings: Section[];
  /** Index (fractional) of the chest slice; shirts hang straight below it. */
  chestT: number;
  /** How a shirt hangs below the chest: how quickly (meters) and how fully (0..1). */
  drape: { reach: number; amount: number };
  neck: { y: number; r: number; height: number };
  head: { y: number; rx: number; ry: number; rz: number };
  /** Shoulder joint, where the arm (and sleeve) starts. */
  shoulder: { x: number; y: number; z: number };
  /** Arm angle out from vertical, radians. */
  armAngle: number;
  upperArm: number;
  forearm: number;
  hand: number;
  /** Arm radius at shoulder, elbow, wrist. */
  armR: [number, number, number];
  /** Hem heights per garment. */
  hem: { tee: number; longsleeve: number; hoodie: number };
  /** Short-sleeve length along the arm. */
  teeSleeve: number;
  /** Where the camera looks. */
  focusY: number;
}

export const BODIES: Record<FitId, BodyProfile> = {
  joel: {
    id: 'joel',
    label: "Joel's fit",
    rings: [
      { y: 0.74, a: 0.14, f: 0.085, b: 0.1 },
      { y: 0.8, a: 0.168, f: 0.1, b: 0.118 },
      { y: 0.9, a: 0.18, f: 0.108, b: 0.126 },
      { y: 1.04, a: 0.162, f: 0.108, b: 0.106 },
      { y: 1.18, a: 0.17, f: 0.122, b: 0.11 },
      { y: 1.3, a: 0.178, f: 0.128, b: 0.116 },
      { y: 1.39, a: 0.19, f: 0.112, b: 0.112 },
      { y: 1.445, a: 0.204, f: 0.09, b: 0.092 },
      { y: 1.48, a: 0.152, f: 0.072, b: 0.072 },
      { y: 1.505, a: 0.078, f: 0.06, b: 0.06 },
    ],
    chestT: 5,
    drape: { reach: 0.05, amount: 1 },
    neck: { y: 1.49, r: 0.054, height: 0.12 },
    head: { y: 1.69, rx: 0.084, ry: 0.112, rz: 0.098 },
    shoulder: { x: 0.185, y: 1.41, z: 0 },
    armAngle: 0.25,
    upperArm: 0.3,
    forearm: 0.27,
    hand: 0.17,
    armR: [0.05, 0.036, 0.026],
    hem: { tee: 0.8, longsleeve: 0.8, hoodie: 0.79 },
    teeSleeve: 0.17,
    focusY: 1.2,
  },
  erin: {
    id: 'erin',
    label: "Erin's fit",
    rings: [
      { y: 0.7, a: 0.14, f: 0.085, b: 0.1 },
      { y: 0.76, a: 0.168, f: 0.1, b: 0.122 },
      { y: 0.86, a: 0.182, f: 0.108, b: 0.132 },
      { y: 1.0, a: 0.136, f: 0.094, b: 0.096 },
      { y: 1.1, a: 0.146, f: 0.114, b: 0.1 },
      { y: 1.17, a: 0.155, f: 0.146, b: 0.104 },
      { y: 1.24, a: 0.156, f: 0.12, b: 0.104 },
      { y: 1.31, a: 0.166, f: 0.094, b: 0.098 },
      { y: 1.352, a: 0.172, f: 0.074, b: 0.078 },
      { y: 1.38, a: 0.128, f: 0.06, b: 0.06 },
      { y: 1.4, a: 0.066, f: 0.05, b: 0.052 },
    ],
    chestT: 5,
    drape: { reach: 0.12, amount: 0.6 },
    neck: { y: 1.385, r: 0.047, height: 0.12 },
    head: { y: 1.57, rx: 0.076, ry: 0.104, rz: 0.09 },
    shoulder: { x: 0.155, y: 1.302, z: 0 },
    armAngle: 0.24,
    upperArm: 0.27,
    forearm: 0.245,
    hand: 0.155,
    armR: [0.043, 0.031, 0.022],
    hem: { tee: 0.75, longsleeve: 0.75, hoodie: 0.74 },
    teeSleeve: 0.12,
    focusY: 1.1,
  },
};

/** The fit to show someone by default: the fitted mannequin for Erin, the regular one for everyone else (who can switch, and it's remembered). */
export function fitFor(personId: string | undefined): FitId {
  return personId === 'erin' ? 'erin' : 'joel';
}

export function body(id: string | undefined): BodyProfile {
  return id === 'erin' ? BODIES.erin : BODIES.joel;
}

// --- maths ---------------------------------------------------------------------

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Smooth slice at fractional ring index t (0 .. rings.length - 1). */
export function sectionAt(rings: Section[], t: number): Section {
  const n = rings.length;
  const tt = clamp(t, 0, n - 1);
  const i = Math.min(Math.floor(tt), n - 2);
  const u = tt - i;
  const r = (k: number) => rings[clamp(k, 0, n - 1)];
  const k = (key: keyof Section) => catmull(r(i - 1)[key], r(i)[key], r(i + 1)[key], r(i + 2)[key], u);
  return { y: k('y'), a: Math.max(0.001, k('a')), f: Math.max(0.001, k('f')), b: Math.max(0.001, k('b')) };
}

/** Fractional ring index for a height. */
export function tAtY(rings: Section[], y: number): number {
  let lo = 0;
  let hi = rings.length - 1;
  if (y <= rings[0].y) return 0;
  if (y >= rings[hi].y) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sectionAt(rings, mid).y < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const EXP = 2 / 2.4; // superellipse: a touch squarer than an ellipse, like a real torso

/** Point on a slice. theta = PI/2 is the front center, -PI/2 the back. */
export function ringPoint(s: Section, theta: number): [number, number] {
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const x = s.a * Math.sign(c) * Math.abs(c) ** EXP;
  const z = (sn >= 0 ? s.f : s.b) * Math.sign(sn) * Math.abs(sn) ** EXP;
  return [x, z];
}
