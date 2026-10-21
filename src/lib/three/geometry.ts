// Small geometry helpers: column-sampled surfaces (torsos, shirts), lathed
// limbs and sleeves, tubes, and "where does this ray hit the fabric".
import * as THREE from 'three';

export interface SurfaceSpec {
  columns: number;
  rows: number;
  /** Fine samples from bottom to top for a column at angle theta (PI/2 = front). */
  column: (theta: number) => THREE.Vector3[];
  /** Arc length to trim off the top of this column (necklines). */
  trimTop?: (theta: number) => number;
  /** Arc length to trim off the bottom of this column. */
  trimBottom?: (theta: number) => number;
  /** Texture repeats around and up, for the knit normal map. */
  uvScale?: [number, number];
}

export interface Surface {
  geometry: THREE.BufferGeometry;
  /** Last row of vertices, one per column (no duplicate seam vertex). */
  topRing: THREE.Vector3[];
  bottomRing: THREE.Vector3[];
}

/** Resamples a polyline at a given arc-length position. */
function atLength(points: THREE.Vector3[], cum: number[], target: number, out: THREE.Vector3): THREE.Vector3 {
  if (target <= 0) return out.copy(points[0]);
  const last = cum.length - 1;
  if (target >= cum[last]) return out.copy(points[last]);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid;
    else hi = mid;
  }
  const t = (target - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return out.lerpVectors(points[lo], points[hi], t);
}

export function buildSurface(spec: SurfaceSpec): Surface {
  const { columns, rows } = spec;
  const [uS, vS] = spec.uvScale ?? [8, 10];
  const stride = columns + 1;
  const pos = new Float32Array(stride * (rows + 1) * 3);
  const uv = new Float32Array(stride * (rows + 1) * 2);
  const topRing: THREE.Vector3[] = [];
  const bottomRing: THREE.Vector3[] = [];
  const tmp = new THREE.Vector3();

  for (let j = 0; j <= columns; j++) {
    // Seam at the back center, where it's least noticeable.
    const theta = -Math.PI / 2 + (2 * Math.PI * j) / columns;
    const pts = spec.column(theta);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
    const total = cum[cum.length - 1];
    const start = Math.min(total * 0.9, spec.trimBottom?.(theta) ?? 0);
    const end = Math.max(start + total * 0.1, total - (spec.trimTop?.(theta) ?? 0));
    for (let i = 0; i <= rows; i++) {
      const L = start + ((end - start) * i) / rows;
      atLength(pts, cum, L, tmp);
      const idx = i * stride + j;
      pos[idx * 3] = tmp.x;
      pos[idx * 3 + 1] = tmp.y;
      pos[idx * 3 + 2] = tmp.z;
      uv[idx * 2] = (j / columns) * uS;
      uv[idx * 2 + 1] = L * vS;
      if (j < columns && i === rows) topRing.push(tmp.clone());
      if (j < columns && i === 0) bottomRing.push(tmp.clone());
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  orientOutward(geometry, rows, stride);
  stitchSeam(geometry, rows, stride, columns);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, topRing, bottomRing };
}

/** Flips the winding if normals point inwards (checked at mid-height front). */
function orientOutward(g: THREE.BufferGeometry, rows: number, stride: number) {
  const n = g.getAttribute('normal');
  const p = g.getAttribute('position');
  const i = Math.floor(rows / 2) * stride + Math.floor(stride / 2);
  const cx = 0;
  const radial = new THREE.Vector3(p.getX(i) - cx, 0, p.getZ(i));
  const normal = new THREE.Vector3(n.getX(i), 0, n.getZ(i));
  if (radial.dot(normal) < 0) {
    const idx = g.getIndex()!;
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let k = 0; k < arr.length; k += 3) {
      const t = arr[k + 1];
      arr[k + 1] = arr[k + 2];
      arr[k + 2] = t;
    }
    idx.needsUpdate = true;
    g.computeVertexNormals();
  }
}

/** The seam column is duplicated for UVs; average its normals so there's no visible crease. */
function stitchSeam(g: THREE.BufferGeometry, rows: number, stride: number, columns: number) {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i <= rows; i++) {
    const a = i * stride;
    const b = a + columns;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/** A lathed shape (sleeves, limbs) laid along `dir` starting at `origin`. */
export function lathedAlong(profile: [number, number][], origin: THREE.Vector3, dir: THREE.Vector3, segments = 40): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 0.0001), h)),
    segments,
  );
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(origin.x, origin.y, origin.z);
  g.computeBoundingSphere();
  return g;
}

/** Rounded tapered limb from p0 to p1. */
export function limb(p0: THREE.Vector3, p1: THREE.Vector3, r0: number, r1: number, segments = 28): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  const prof: [number, number][] = [];
  const caps = 8;
  for (let k = 0; k <= caps; k++) {
    const a = (k / caps) * (Math.PI / 2);
    prof.push([r0 * Math.sin(a), r0 * (1 - Math.cos(a)) - r0 * 0.6]);
  }
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    prof.push([r0 + (r1 - r0) * t, len * t]);
  }
  for (let k = 0; k <= caps; k++) {
    const a = (k / caps) * (Math.PI / 2);
    prof.push([r1 * Math.cos(a), len + r1 * Math.sin(a) * 0.6]);
  }
  return lathedAlong(prof, p0, dir, segments);
}

/** Scales a geometry's UVs so tiling textures come out at real-world size. */
export function scaleUV<T extends THREE.BufferGeometry>(g: T, su: number, sv: number): T {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

export function tube(points: THREE.Vector3[], radius: number, closed = false, tubular = 96, radial = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

const ray = new THREE.Raycaster();

/**
 * Where a horizontal ray at (x, y) first meets the meshes, coming from the
 * front (+z) or back (-z). Null if it misses.
 */
export function surfaceHit(meshes: THREE.Object3D[], x: number, y: number, side: 'front' | 'back'): THREE.Intersection | null {
  const s = side === 'front' ? 1 : -1;
  // Nudge off x = 0: a ray exactly along the back seam can slip between triangles.
  const nx = Math.abs(x) < 1e-4 ? 1e-4 : x;
  ray.set(new THREE.Vector3(nx, y, 2 * s), new THREE.Vector3(0, 0, -s));
  for (const m of meshes) m.updateMatrixWorld(true);
  const hits = ray.intersectObjects(meshes, false);
  return hits[0] ?? null;
}
