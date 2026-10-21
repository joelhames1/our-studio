// Browser-only: materials with procedurally drawn knit and rib normal maps.
import * as THREE from 'three';
import type { GarmentMaterials } from './garment';

function normalMapFromHeight(size: number, height: (x: number, y: number) => number, strength: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => height(((x % size) + size) % size, ((y % size) + size) % size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

let knit: THREE.CanvasTexture | null = null;
let rib: THREE.CanvasTexture | null = null;

/** Jersey knit: little V-shaped stitches in columns. */
function knitMap(): THREE.CanvasTexture {
  if (knit) return knit;
  const cw = 8;
  const ch = 8;
  knit = normalMapFromHeight(
    128,
    (x, y) => {
      const cx = (x % cw) / cw - 0.5;
      const cy = (y % ch) / ch;
      const v = Math.abs(Math.abs(cx) * 1.6 - (1 - cy) * 0.8);
      const strand = Math.max(0, 1 - v * 4);
      const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return strand + (noise - Math.floor(noise)) * 0.15;
    },
    1.2,
  );
  return knit;
}

/** Ribbing for collars, cuffs and bands: vertical ridges. */
function ribMap(): THREE.CanvasTexture {
  if (rib) return rib;
  rib = normalMapFromHeight(128, (x) => Math.sin((x / 128) * Math.PI * 2 * 16), 2.4);
  return rib;
}

function shade(hex: string, amt: number): THREE.Color {
  const c = new THREE.Color(hex);
  return amt < 0 ? c.lerp(new THREE.Color('#000000'), -amt) : c.lerp(new THREE.Color('#ffffff'), amt);
}

export interface Wardrobe extends GarmentMaterials {
  skin: THREE.Material;
  metal: THREE.Material;
  setColor: (hex: string, tone: 'light' | 'dark') => void;
  dispose: () => void;
}

export function createWardrobe(hex: string, tone: 'light' | 'dark'): Wardrobe {
  const fabric = new THREE.MeshPhysicalMaterial({
    roughness: 0.94,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.75,
    normalMap: knitMap(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: THREE.DoubleSide,
  });
  const ribM = new THREE.MeshPhysicalMaterial({
    roughness: 0.96,
    sheen: 0.5,
    sheenRoughness: 0.8,
    normalMap: ribMap(),
    normalScale: new THREE.Vector2(0.55, 0.55),
    side: THREE.DoubleSide,
  });
  const seam = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const cord = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.85 });
  const aglet = new THREE.MeshStandardMaterial({ color: '#cfc8bb', roughness: 0.45, metalness: 0.2 });
  const skin = new THREE.MeshPhysicalMaterial({ color: '#e8e1d6', roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9a9389', roughness: 0.32, metalness: 0.85 });

  const setColor = (h: string, t: 'light' | 'dark') => {
    fabric.color.set(h);
    ribM.color.copy(shade(h, t === 'dark' ? 0.04 : -0.04));
    // Sheen tinted by the cloth itself, so it adds that soft cotton glow at the
    // edges without washing the color out.
    fabric.sheenColor.copy(shade(h, t === 'dark' ? 0.18 : 0.06));
    ribM.sheenColor.copy(shade(h, t === 'dark' ? 0.15 : 0.04));
    seam.color.copy(shade(h, t === 'dark' ? -0.35 : -0.22));
  };
  setColor(hex, tone);

  return {
    fabric,
    rib: ribM,
    seam,
    cord,
    aglet,
    skin,
    metal,
    setColor,
    dispose: () => [fabric, ribM, seam, cord, aglet, skin, metal].forEach((m) => m.dispose()),
  };
}

export function createPrintMaterial(texture: THREE.Texture): THREE.MeshPhysicalMaterial {
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    roughness: 0.82,
    sheen: 0.5,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
  });
}
