// A clean fashion mannequin: torso form, neck, abstract head, relaxed arms,
// on a slim stand. Deliberately faceless and skin-tone neutral.
import * as THREE from 'three';
import { ringPoint, sectionAt, type BodyProfile } from './body';
import { buildSurface, limb } from './geometry';

export interface MannequinBuild {
  group: THREE.Group;
  dispose: () => void;
}

export function buildMannequin(body: BodyProfile, skin: THREE.Material, metal: THREE.Material): MannequinBuild {
  const group = new THREE.Group();
  group.name = 'mannequin';
  const geometries: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    geometries.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };

  // Torso form, with a rounded bottom where it meets the stand.
  const n = body.rings.length - 1;
  const bottom = body.rings[0];
  const torso = buildSurface({
    columns: 72,
    rows: 70,
    column: (theta) => {
      const pts: THREE.Vector3[] = [];
      // Rounded cap underneath
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * (Math.PI / 2);
        const s = { ...bottom, a: bottom.a * Math.sin(a) + 0.002, f: bottom.f * Math.sin(a) + 0.002, b: bottom.b * Math.sin(a) + 0.002 };
        const [x, z] = ringPoint(s, theta);
        pts.push(new THREE.Vector3(x, bottom.y - 0.075 * Math.cos(a), z));
      }
      for (let k = 1; k <= 160; k++) {
        const s = sectionAt(body.rings, (n * k) / 160);
        const [x, z] = ringPoint(s, theta);
        pts.push(new THREE.Vector3(x, s.y, z));
      }
      return pts;
    },
  });
  add(torso.geometry, skin, 'torso');

  // Neck and head
  const neckBase = new THREE.Vector3(0, body.neck.y - 0.05, -0.004);
  const neckTop = new THREE.Vector3(0, body.neck.y + body.neck.height, 0.006);
  add(limb(neckBase, neckTop, body.neck.r, body.neck.r * 0.92, 32), skin, 'neck');
  const headG = new THREE.SphereGeometry(1, 48, 36);
  geometries.push(headG);
  const head = new THREE.Mesh(headG, skin);
  head.name = 'head';
  head.scale.set(body.head.rx, body.head.ry, body.head.rz);
  head.position.set(0, body.head.y, 0.012);
  head.rotation.x = -0.12;
  group.add(head);

  // Arms, slightly away from the body, palms towards the thighs.
  for (const side of [1, -1]) {
    const j = new THREE.Vector3(side * body.shoulder.x, body.shoulder.y, body.shoulder.z);
    const d = new THREE.Vector3(side * Math.sin(body.armAngle), -Math.cos(body.armAngle), 0).normalize();
    const elbow = j.clone().addScaledVector(d, body.upperArm);
    const wrist = elbow.clone().addScaledVector(d, body.forearm);
    const [r0, r1, r2] = body.armR;
    add(limb(j.clone().addScaledVector(d, -0.03), elbow, r0, r1), skin, 'upper-arm');
    add(limb(elbow, wrist, r1 * 1.02, r2), skin, 'forearm');
    const hand = add(limb(wrist.clone().addScaledVector(d, -0.01), wrist.clone().addScaledVector(d, body.hand), r2 * 1.15, r2 * 0.9, 20), skin, 'hand');
    // Flatten the hand sideways around its own axis.
    hand.geometry.translate(-wrist.x, -wrist.y, -wrist.z);
    hand.geometry.scale(0.62 + 0.38 * Math.abs(d.y), 1, 1);
    hand.geometry.translate(wrist.x, wrist.y, wrist.z);
  }

  // Stand
  const pole = new THREE.CylinderGeometry(0.011, 0.011, 1.2, 16);
  pole.translate(0, bottom.y - 0.07 - 0.6, 0);
  add(pole, metal, 'stand');
  const collar = new THREE.CylinderGeometry(0.022, 0.03, 0.03, 24);
  collar.translate(0, bottom.y - 0.078, 0);
  add(collar, metal, 'stand-collar');

  return { group, dispose: () => geometries.forEach((g) => g.dispose()) };
}
