import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BODIES, sectionAt } from '@/lib/three/body';
import { buildGarment } from '@/lib/three/garment';
import { buildMannequin } from '@/lib/three/mannequin';
import { applyPrint, METRES_PER_INCH, printBox } from '@/lib/three/print';
import { surfaceHit } from '@/lib/three/geometry';
import { inlineAssets } from '@/lib/client/designTexture';

const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const mats = { fabric: mat, rib: mat, seam: mat, cord: mat, aglet: mat };

function noNaN(obj: THREE.Object3D) {
  let bad = 0;
  obj.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const p = g?.getAttribute('position');
    if (!p) return;
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) bad++;
  });
  return bad === 0;
}

describe('3D garments', () => {
  for (const body of Object.values(BODIES)) {
    for (const style of ['tee', 'longsleeve', 'hoodie'] as const) {
      it(`builds a ${style} for ${body.label} that fits the body`, () => {
        const g = buildGarment(style, body, mats);
        expect(noNaN(g.group)).toBe(true);
        const shell = g.group.getObjectByName('shell') as THREE.Mesh;
        shell.geometry.computeBoundingBox();
        const bb = shell.geometry.boundingBox!;
        const chest = sectionAt(body.rings, body.chestT);
        // Shell is a little wider than the chest (ease), but not a tent.
        expect(bb.max.x).toBeGreaterThan(chest.a);
        expect(bb.max.x).toBeLessThan(chest.a * 1.35 + 0.05);
        // Runs from the hem up to the neck.
        expect(bb.min.y).toBeCloseTo(body.hem[style], 1);
        expect(bb.max.y).toBeGreaterThan(body.rings[body.rings.length - 1].y - 0.06);
        // The front of the collar dips lower than the back, like a real neckline.
        expect(g.collarFront.y).toBeLessThan(g.collarBack.y);
        // Front surface is where the print lands.
        const hit = surfaceHit([shell], 0, chest.y, 'front')!;
        expect(hit.point.z).toBeGreaterThan(chest.f);
        expect(surfaceHit([shell], 0, chest.y, 'back')!.point.z).toBeLessThan(0);
        g.dispose();
      });
    }
    it(`builds ${body.label}'s mannequin`, () => {
      const m = buildMannequin(body, mat, mat);
      expect(noNaN(m.group)).toBe(true);
      const box = new THREE.Box3().setFromObject(m.group);
      expect(box.max.y).toBeGreaterThan(body.head.y);
      m.dispose();
    });
  }

  it('puts the hood on the back of the hoodie', () => {
    const g = buildGarment('hoodie', BODIES.joel, mats);
    expect(g.group.getObjectByName('hood')!.position.z).toBeLessThan(0);
    expect(g.group.getObjectByName('pocket')).toBeTruthy();
  });
});

describe('3D print', () => {
  it('is printed at its real size on the chest', () => {
    const body = BODIES.joel;
    const g = buildGarment('tee', body, mats);
    const box = printBox(g, body, 'tee', { widthIn: 12, placement: 'center' });
    expect(box.w).toBeCloseTo(12 * METRES_PER_INCH, 5);
    const decals = applyPrint(g, body, 'tee', mat, { widthIn: 12, placement: 'center' });
    expect(decals.length).toBeGreaterThan(0);
    decals[0].geometry.computeBoundingBox();
    const bb = decals[0].geometry.boundingBox!;
    const width = bb.max.x - bb.min.x;
    expect(width).toBeGreaterThan(0.28);
    expect(width).toBeLessThanOrEqual(0.306);
    // Below the collar, on the front.
    expect(bb.max.y).toBeLessThan(g.collarFront.y);
    expect(bb.min.z).toBeGreaterThan(0);
  });

  it('can sit on the left chest', () => {
    const body = BODIES.erin;
    const g = buildGarment('tee', body, mats);
    const decals = applyPrint(g, body, 'tee', mat, { widthIn: 4, placement: 'left-chest' });
    decals[0].geometry.computeBoundingBox();
    const bb = decals[0].geometry.boundingBox!;
    expect((bb.min.x + bb.max.x) / 2).toBeGreaterThan(0.05);
  });

  it('wraps onto the hoodie pocket too', () => {
    const body = BODIES.joel;
    const g = buildGarment('hoodie', body, mats);
    const decals = applyPrint(g, body, 'hoodie', mat, { widthIn: 12, placement: 'center' });
    expect(decals.map((d) => d.name)).toContain('print-shell');
  });
});

describe('design texture', () => {
  it('inlines artwork so the canvas can draw it', async () => {
    const svg = '<svg><image href="/api/assets/art/a.png"/><image href="/api/assets/art/a.png"/><image href="https://x/y.png"/></svg>';
    const calls: string[] = [];
    const out = await inlineAssets(svg, async (u) => {
      calls.push(u);
      return 'data:image/png;base64,AAAA';
    });
    expect(calls).toEqual(['/api/assets/art/a.png']);
    expect(out).toBe('<svg><image href="data:image/png;base64,AAAA"/><image href="data:image/png;base64,AAAA"/><image href="https://x/y.png"/></svg>');
  });
  it('leaves artwork alone if it cannot be fetched', async () => {
    const svg = '<svg><image href="/api/assets/art/b.png"/></svg>';
    expect(await inlineAssets(svg, async () => Promise.reject(new Error('nope')))).toBe(svg);
  });
});

describe('3D back print', () => {
  it('sits on the back at its real size', () => {
    const body = BODIES.joel;
    const g = buildGarment('tee', body, mats);
    const decals = applyPrint(g, body, 'tee', mat, { widthIn: 12, placement: 'center', side: 'back' });
    expect(decals.length).toBeGreaterThan(0);
    decals[0].geometry.computeBoundingBox();
    const bb = decals[0].geometry.boundingBox!;
    expect(bb.max.z).toBeLessThan(0);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(0.28);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(0.306);
    expect(bb.max.y).toBeLessThan(g.collarBack.y - 0.08);
  });

  it('can be a small print just under the collar, or under the hood', () => {
    for (const style of ['tee', 'hoodie'] as const) {
      const body = BODIES.erin;
      const g = buildGarment(style, body, mats);
      const box = printBox(g, body, style, { widthIn: 3.5, placement: 'neck', side: 'back' });
      expect(box.w).toBeCloseTo(3.5 * METRES_PER_INCH, 5);
      const decals = applyPrint(g, body, style, mat, { widthIn: 3.5, placement: 'neck', side: 'back' });
      decals[0].geometry.computeBoundingBox();
      const bb = decals[0].geometry.boundingBox!;
      expect(bb.max.z).toBeLessThan(0);
      const below = g.collarBack.y - bb.max.y;
      if (style === 'tee') expect(below).toBeLessThan(0.06);
      else expect(below).toBeGreaterThan(0.2);
    }
  });
});
