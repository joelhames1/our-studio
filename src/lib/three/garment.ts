// Procedural garments that fit a BodyProfile: a torso shell that hangs off the
// chest like real cloth, set-in sleeves, a ribbed collar, and for the hoodie a
// hood, kangaroo pocket, drawstrings and ribbed hem and cuffs.
import * as THREE from 'three';
import type { GarmentStyle } from '@/lib/design/types';
import { clamp, ringPoint, sectionAt, smoothstep, tAtY, type BodyProfile, type Section } from './body';
import { buildSurface, lathedAlong, scaleUV, surfaceHit, tube } from './geometry';

export interface GarmentMaterials {
  fabric: THREE.Material;
  rib: THREE.Material;
  seam: THREE.Material;
  cord: THREE.Material;
  aglet: THREE.Material;
}

export interface GarmentBuild {
  group: THREE.Group;
  /** Meshes a print can land on. */
  printTargets: THREE.Mesh[];
  collarFront: THREE.Vector3;
  collarBack: THREE.Vector3;
  dispose: () => void;
}

interface Spec {
  ease: number;
  flare: number;
  dip: number;
  backDip: number;
  band: number;
  long: boolean;
  collar: boolean;
}

const SPECS: Record<GarmentStyle, Spec> = {
  tee: { ease: 0.018, flare: 0.014, dip: 0.08, backDip: 0.012, band: 0, long: false, collar: true },
  longsleeve: { ease: 0.02, flare: 0.012, dip: 0.075, backDip: 0.012, band: 0, long: true, collar: true },
  hoodie: { ease: 0.036, flare: 0.0, dip: 0.035, backDip: 0, band: 0.065, long: true, collar: false },
};

/** The garment's slice at ring index t: body + ease, hanging straight down from the chest. */
function shellSection(body: BodyProfile, spec: Spec, hemY: number, t: number): Section {
  const s = sectionAt(body.rings, t);
  const chest = sectionAt(body.rings, body.chestT);
  let { a, f, b } = s;
  if (s.y < chest.y) {
    // Cloth drapes off the chest/bust rather than hugging the waist.
    const hang = smoothstep(chest.y, chest.y - body.drape.reach, s.y) * body.drape.amount;
    a = Math.max(a, a + (chest.a * 0.985 - a) * hang);
    f = Math.max(f, f + (chest.f * 0.9 - f) * hang);
    b = Math.max(b, b + (chest.b - b) * hang);
  }
  let ease = spec.ease;
  // Shoulders sit closer; the hem flares a touch.
  ease *= 0.7 + 0.3 * smoothstep(body.rings[body.rings.length - 1].y, chest.y, s.y);
  ease += spec.flare * (1 - smoothstep(hemY, hemY + 0.14, s.y));
  if (spec.band) {
    // Ribbed band pulls in; the fabric just above it blouses out.
    const inBand = 1 - smoothstep(hemY + spec.band - 0.006, hemY + spec.band + 0.006, s.y);
    const blouse = smoothstep(hemY + spec.band, hemY + spec.band + 0.04, s.y) * (1 - smoothstep(hemY + spec.band + 0.04, hemY + spec.band + 0.16, s.y));
    ease = ease - inBand * spec.ease * 0.55 + blouse * 0.008;
  }
  return { y: s.y, a: a + ease, f: f + ease, b: b + ease };
}

function shellColumn(body: BodyProfile, spec: Spec, hemY: number) {
  const t0 = tAtY(body.rings, hemY);
  const t1 = body.rings.length - 1;
  const samples = 260;
  return (theta: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= samples; k++) {
      const t = t0 + ((t1 - t0) * k) / samples;
      const s = shellSection(body, spec, hemY, t);
      const [x, z] = ringPoint(s, theta);
      pts.push(new THREE.Vector3(x, s.y, z));
    }
    return pts;
  };
}

function armDir(body: BodyProfile, side: 1 | -1) {
  return new THREE.Vector3(side * Math.sin(body.armAngle), -Math.cos(body.armAngle), 0).normalize();
}

/** Arm radius at distance h from the shoulder joint. */
export function armRadiusAt(body: BodyProfile, h: number): number {
  const [r0, r1, r2] = body.armR;
  if (h <= body.upperArm) return r0 + (r1 - r0) * clamp(h / body.upperArm, 0, 1);
  return r1 + (r2 - r1) * clamp((h - body.upperArm) / body.forearm, 0, 1);
}

function sleeveProfile(body: BodyProfile, spec: Spec): { profile: [number, number][]; length: number } {
  const length = spec.long ? body.upperArm + body.forearm - (spec.band ? 0.055 : 0.035) : body.teeSleeve;
  const top = body.armR[0] + (spec.long ? (spec.band ? 0.028 : 0.022) : 0.026);
  const cap = top * 0.62;
  const profile: [number, number][] = [];
  // Rounded sleeve cap over the shoulder.
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2);
    profile.push([top * Math.sin(a), -cap * Math.cos(a)]);
  }
  for (let k = 1; k <= 24; k++) {
    const h = (length * k) / 24;
    const clearance = spec.long ? (spec.band ? 0.028 : 0.022) - 0.01 * (h / length) : 0.026 - 0.002 * (h / length);
    const r = armRadiusAt(body, h) + clearance;
    profile.push([Math.min(top, r + (top - r) * (1 - smoothstep(0, 0.06, h))), h]);
  }
  return { profile, length };
}

export function buildGarment(style: GarmentStyle, body: BodyProfile, mats: GarmentMaterials): GarmentBuild {
  const spec = SPECS[style];
  const hemY = body.hem[style];
  const group = new THREE.Group();
  group.name = `garment-${style}`;
  const geometries: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    geometries.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  // --- torso shell -------------------------------------------------------------
  const necklineTrim = (theta: number) => {
    const s = Math.sin(theta);
    const base = style === 'hoodie' ? 0.03 : 0.004;
    return base + spec.dip * Math.max(0, s) ** 1.6 + spec.backDip * Math.max(0, -s) ** 2;
  };
  const shell = buildSurface({ columns: 96, rows: 90, column: shellColumn(body, spec, hemY), trimTop: necklineTrim, uvScale: [14, 18] });
  const shellMesh = add(shell.geometry, mats.fabric, 'shell');
  const printTargets = [shellMesh];

  const ringAt = (ring: THREE.Vector3[], theta: number) => {
    const j = Math.round(((theta + Math.PI / 2) / (2 * Math.PI)) * ring.length) % ring.length;
    return ring[(j + ring.length) % ring.length];
  };
  const collarFront = ringAt(shell.topRing, Math.PI / 2).clone();
  const collarBack = ringAt(shell.topRing, -Math.PI / 2).clone();

  // Hem: a turned-up edge reads as a real hem.
  if (!spec.band) {
    add(scaleUV(tube(shell.bottomRing.map((p) => new THREE.Vector3(p.x * 1.004, p.y + 0.003, p.z * 1.004)), 0.0035, true, 160, 6), 40, 1), mats.fabric, 'hem');
  }

  // --- collar ------------------------------------------------------------------
  if (spec.collar) {
    const pts = shell.topRing.map((p) => {
      const r = Math.hypot(p.x, p.z) || 1;
      return new THREE.Vector3(p.x * (1 - 0.004 / r), p.y + 0.004, p.z * (1 - 0.004 / r));
    });
    add(scaleUV(tube(pts, 0.0095, true, 160, 12), 12, 1), mats.rib, 'collar');
  }

  // --- sleeves -------------------------------------------------------------------
  const { profile, length } = sleeveProfile(body, spec);
  for (const side of [1, -1] as const) {
    const j = new THREE.Vector3(side * body.shoulder.x, body.shoulder.y, body.shoulder.z);
    const d = armDir(body, side);
    add(scaleUV(lathedAlong(profile, j, d, 48), 6, (length + 0.05) * 18), mats.fabric, `sleeve-${side > 0 ? 'l' : 'r'}`);
    const endR = profile[profile.length - 1][0];
    const end = j.clone().addScaledVector(d, length);
    if (spec.long) {
      // Ribbed cuff
      const cuffLen = spec.band ? 0.06 : 0.045;
      const cr = armRadiusAt(body, length) + 0.012;
      const cuff: [number, number][] = [
        [endR * 0.98, -0.004],
        [cr + 0.002, 0.01],
        [cr, cuffLen - 0.006],
        [cr - 0.004, cuffLen],
      ];
      add(scaleUV(lathedAlong(cuff, end, d, 40), 3, 1), mats.rib, `cuff-${side}`);
    } else {
      const ring: THREE.Vector3[] = [];
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        ring.push(new THREE.Vector3(Math.cos(a) * endR, -0.004, Math.sin(a) * endR).applyQuaternion(q).add(end));
      }
      add(scaleUV(tube(ring, 0.0035, true, 80, 6), 12, 1), mats.fabric, `sleeve-hem-${side}`);
    }
  }

  // --- hoodie extras ---------------------------------------------------------------
  if (style === 'hoodie') {
    // Ribbed hem band (redrawn just outside the shell so the rib texture shows).
    const bandSurface = buildSurface({
      columns: 96,
      rows: 6,
      column: (theta) => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const y = hemY + (spec.band * k) / 12;
          const s = shellSection(body, spec, hemY, tAtY(body.rings, y));
          const [x, z] = ringPoint({ ...s, a: s.a + 0.002, f: s.f + 0.002, b: s.b + 0.002 }, theta);
          pts.push(new THREE.Vector3(x, y, z));
        }
        return pts;
      },
      uvScale: [18, 1],
    });
    const band = add(bandSurface.geometry, mats.rib, 'hem-band');
    printTargets.push(band);

    const neckY = collarBack.y;
    const frontAt = (x: number, y: number, lift: number) => {
      const hit = surfaceHit([shellMesh], x, y, 'front');
      return new THREE.Vector3(x, y, (hit?.point.z ?? 0.12) + lift);
    };
    const backAt = (x: number, y: number, lift: number) => {
      const hit = surfaceHit([shellMesh], x, y, 'back');
      return new THREE.Vector3(x, y, (hit?.point.z ?? -0.12) - lift);
    };

    // Hood resting on the shoulders: a thick rolled edge around the neck...
    const vY = neckY - 0.12 * (body.id === 'erin' ? 0.9 : 1);
    const neckR = body.neck.r + 0.05;
    const edge = [
      new THREE.Vector3(0, neckY + 0.014, collarBack.z - 0.022),
      new THREE.Vector3(neckR * 0.75, neckY + 0.008, -neckR * 0.75),
      new THREE.Vector3(neckR * 1.06, neckY - 0.012, 0.0),
      frontAt(neckR * 0.72, neckY - 0.06, 0.016),
      frontAt(0.012, vY, 0.022),
      frontAt(-0.012, vY, 0.022),
      frontAt(-neckR * 0.72, neckY - 0.06, 0.016),
      new THREE.Vector3(-neckR * 1.06, neckY - 0.012, 0.0),
      new THREE.Vector3(-neckR * 0.75, neckY + 0.008, -neckR * 0.75),
    ];
    add(scaleUV(tube(edge, 0.03, true, 140, 16), 14, 2), mats.fabric, 'hood-edge');

    // ...and the hood itself lying flat against the upper back.
    const hoodG = scaleUV(new THREE.SphereGeometry(1, 40, 28), 6, 4);
    geometries.push(hoodG);
    const hood = new THREE.Mesh(hoodG, mats.fabric);
    hood.name = 'hood';
    const backZ = backAt(0, neckY - 0.11, 0).z;
    hood.scale.set(0.15 * (body.id === 'erin' ? 0.92 : 1), 0.165, 0.055);
    hood.position.set(0, neckY - 0.09, backZ + 0.012);
    hood.rotation.x = 0.32;
    group.add(hood);
    add(
      tube(
        [new THREE.Vector3(0, neckY + 0.03, backZ - 0.03), new THREE.Vector3(0, neckY - 0.08, backZ - 0.05), new THREE.Vector3(0, neckY - 0.24, backZ - 0.02)],
        0.0025,
        false,
        40,
        6,
      ),
      mats.seam,
      'hood-seam',
    );

    // Drawstrings with aglets
    for (const side of [1, -1]) {
      const x0 = side * 0.03;
      const pts = [frontAt(x0, vY + 0.035, 0.03), frontAt(x0 * 1.1, vY - 0.06, 0.014), frontAt(x0 * 1.3, vY - 0.17, 0.012)];
      add(tube(pts, 0.0042, false, 40, 8), mats.cord, `cord-${side}`);
      const tip = pts[2];
      const ag = new THREE.CylinderGeometry(0.0056, 0.0056, 0.026, 12);
      geometries.push(ag);
      const m = new THREE.Mesh(ag, mats.aglet);
      m.position.set(tip.x, tip.y - 0.013, tip.z);
      group.add(m);
    }

    // Kangaroo pocket: a panel laid over the front, slanted openings at the sides.
    const pBottom = hemY + spec.band + 0.012;
    const pTop = pBottom + (body.id === 'erin' ? 0.17 : 0.2);
    const wBottom = body.id === 'erin' ? 0.28 : 0.32;
    const wTop = body.id === 'erin' ? 0.2 : 0.23;
    const cols = 16;
    const rowsP = 8;
    const ppos: number[] = [];
    const puv: number[] = [];
    for (let i = 0; i <= rowsP; i++) {
      const v = i / rowsP;
      const y = pBottom + (pTop - pBottom) * v;
      const w = wBottom + (wTop - wBottom) * v;
      for (let jj = 0; jj <= cols; jj++) {
        const u = jj / cols;
        const x = (u - 0.5) * w;
        const p = frontAt(x, y, 0.005);
        ppos.push(p.x, p.y, p.z);
        puv.push(u * 4, v * 3);
      }
    }
    const pidx: number[] = [];
    for (let i = 0; i < rowsP; i++) {
      for (let jj = 0; jj < cols; jj++) {
        const a = i * (cols + 1) + jj;
        pidx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
    pg.setIndex(pidx);
    pg.computeVertexNormals();
    const pocket = add(pg, mats.fabric, 'pocket');
    printTargets.push(pocket);
    const corner = (u: number, v: number) => {
      const y = pBottom + (pTop - pBottom) * v;
      const w = wBottom + (wTop - wBottom) * v;
      return frontAt((u - 0.5) * w, y, 0.0075);
    };
    for (const u of [0, 1]) add(tube([corner(u, 0), corner(u, 0.5), corner(u, 1)], 0.0028, false, 20, 6), mats.seam, 'pocket-opening');
    const topEdge = Array.from({ length: 9 }, (_, k) => corner(k / 8, 1));
    add(tube(topEdge, 0.002, false, 40, 6), mats.seam, 'pocket-top');
  }

  return {
    group,
    printTargets,
    collarFront,
    collarBack,
    dispose: () => geometries.forEach((g) => g.dispose()),
  };
}
