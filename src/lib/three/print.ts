// Puts the design on the shirt as a projected decal at its true printed size,
// so it wraps the chest the way real ink does.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { BodyProfile } from './body';
import type { GarmentBuild } from './garment';
import { surfaceHit } from './geometry';

export const METRES_PER_INCH = 0.0254;
/** Design canvas shape (matches the 1500 x 1800 design canvas). */
const ASPECT = 1800 / 1500;

export interface PrintPlacement {
  widthIn: number;
  /** `neck` is a small print just under the back collar (below the hood on hoodies). */
  placement: 'center' | 'left-chest' | 'neck';
  side?: 'front' | 'back';
}

/** Where the print's box sits on the garment. */
export function printBox(garment: GarmentBuild, body: BodyProfile, style: string, p: PrintPlacement) {
  const w = p.widthIn * METRES_PER_INCH;
  const h = w * ASPECT;
  const side = p.side ?? 'front';
  const leftChest = p.placement === 'left-chest' && side === 'front';
  let top: number;
  if (side === 'back' && p.placement === 'neck') top = garment.collarBack.y - (style === 'hoodie' ? 0.25 : 0.03);
  else if (side === 'back') top = garment.collarBack.y - (style === 'hoodie' ? 0.26 : 0.1);
  else if (style === 'hoodie') top = garment.collarBack.y - (body.id === 'erin' ? 0.13 : 0.145);
  else top = garment.collarFront.y - (leftChest ? 0.06 : 0.07);
  const x = leftChest ? (body.id === 'erin' ? 0.085 : 0.1) : 0;
  return { x, centerY: top - h / 2, w, h, side };
}

export function applyPrint(
  garment: GarmentBuild,
  body: BodyProfile,
  style: string,
  material: THREE.Material,
  p: PrintPlacement,
): THREE.Mesh[] {
  const box = printBox(garment, body, style, p);
  const shell = garment.printTargets[0];
  const hit = surfaceHit([shell], box.x, box.centerY, box.side);
  if (!hit) return [];
  const orientation = new THREE.Euler(0, box.side === 'front' ? 0 : Math.PI, 0);
  const size = new THREE.Vector3(box.w, box.h, 0.26);
  const meshes: THREE.Mesh[] = [];
  for (const target of garment.printTargets) {
    target.updateMatrixWorld(true);
    const geo = new DecalGeometry(target, hit.point, orientation, size);
    if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
      geo.dispose();
      continue;
    }
    const m = new THREE.Mesh(geo, material);
    m.name = `print-${target.name}`;
    m.renderOrder = 2;
    meshes.push(m);
  }
  return meshes;
}
