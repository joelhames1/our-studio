// The 3D try-on scene. Browser-only; loaded on demand so three.js never weighs
// down the rest of the app.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GarmentStyle, Tone } from '@/lib/design/types';
import { body as getBody, type FitId } from './body';
import { buildGarment, type GarmentBuild } from './garment';
import { buildMannequin, type MannequinBuild } from './mannequin';
import { createPrintMaterial, createWardrobe, type Wardrobe } from './materials';
import { applyPrint, type PrintPlacement } from './print';

export interface Outfit {
  style: GarmentStyle;
  colorHex: string;
  tone: Tone;
  fit: FitId;
}

export interface Stage {
  setOutfit: (o: Outfit) => void;
  setPrint: (image: HTMLCanvasElement | null, placement: PrintPlacement) => void;
  /** The print on the back, or null for a plain back. */
  setBackPrint: (image: HTMLCanvasElement | null, placement: PrintPlacement) => void;
  face: (side: 'front' | 'back' | 'three-quarter') => void;
  spin: (on: boolean) => void;
  isSpinning: () => boolean;
  /** Renders one frame and resolves once it's on screen (for screenshots and tests). */
  frame: () => Promise<void>;
  dispose: () => void;
}

export function createStage(canvas: HTMLCanvasElement, opts: { onInteract?: () => void } = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps shirt colors close to their swatches.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.5;

  // Calibrated so a lit shirt front reads close to its swatch color.
  const key = new THREE.DirectionalLight('#fff6ec', 1.25);
  key.position.set(1.6, 2.6, 2.4);
  const rim = new THREE.DirectionalLight('#e6f0ff', 0.8);
  rim.position.set(-1.8, 2.0, -2.6);
  const fill = new THREE.HemisphereLight('#ffffff', '#d9cbb7', 0.2);
  scene.add(key, rim, fill);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.6;
  controls.minPolarAngle = Math.PI / 2 - 0.38;
  controls.maxPolarAngle = Math.PI / 2 + 0.22;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 3.2;

  const root = new THREE.Group();
  scene.add(root);

  let outfit: Outfit | null = null;
  let wardrobe: Wardrobe | null = null;
  let mannequin: MannequinBuild | null = null;
  let garment: GarmentBuild | null = null;
  interface PrintSlot {
    placement: PrintPlacement | null;
    texture: THREE.CanvasTexture | null;
    material: THREE.Material | null;
    decals: THREE.Mesh[];
  }
  const emptySlot = (): PrintSlot => ({ placement: null, texture: null, material: null, decals: [] });
  const slots = { front: emptySlot(), back: emptySlot() };
  let raf = 0;
  let inLoop = false;
  let faceAnim: { from: number; to: number; start: number; dur: number } | null = null;
  let disposed = false;

  const frameWaiters: (() => void)[] = [];

  function fitCamera() {
    const parent = canvas.parentElement;
    const w = parent?.clientWidth || canvas.clientWidth || 400;
    const h = parent?.clientHeight || canvas.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const b = getBody(outfit?.fit);
    const vFov = (camera.fov * Math.PI) / 180;
    const needH = 1.1;
    const needW = 0.88;
    const distH = needH / 2 / Math.tan(vFov / 2);
    const distW = needW / 2 / (Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    controls.minDistance = dist * 0.55;
    controls.maxDistance = dist * 1.25;
    const offset = camera.position.clone().sub(controls.target);
    const target = new THREE.Vector3(0, b.focusY, 0);
    controls.target.copy(target);
    if (offset.lengthSq() < 1e-6) offset.set(0, 0.04, dist);
    offset.setLength(dist);
    camera.position.copy(target).add(offset);
    camera.updateProjectionMatrix();
  }

  function clearSlot(slot: PrintSlot) {
    for (const d of slot.decals) {
      d.geometry.dispose();
      d.removeFromParent();
    }
    slot.decals = [];
  }

  function clearPrint() {
    clearSlot(slots.front);
    clearSlot(slots.back);
  }

  function placeSlot(slot: PrintSlot) {
    clearSlot(slot);
    if (!garment || !outfit || !slot.material || !slot.placement) return;
    slot.decals = applyPrint(garment, getBody(outfit.fit), outfit.style, slot.material, slot.placement);
    for (const d of slot.decals) garment.group.add(d);
  }

  function placePrint() {
    placeSlot(slots.front);
    placeSlot(slots.back);
  }

  function setSlot(slot: PrintSlot, image: HTMLCanvasElement | null, placement: PrintPlacement) {
    slot.placement = placement;
    slot.texture?.dispose();
    slot.material?.dispose();
    slot.texture = null;
    slot.material = null;
    if (image) {
      slot.texture = new THREE.CanvasTexture(image);
      slot.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      slot.material = createPrintMaterial(slot.texture);
    }
    placeSlot(slot);
    kick();
  }

  function rebuild() {
    if (!outfit) return;
    const b = getBody(outfit.fit);
    clearPrint();
    if (garment) {
      garment.group.removeFromParent();
      garment.dispose();
    }
    if (mannequin) {
      mannequin.group.removeFromParent();
      mannequin.dispose();
    }
    if (!wardrobe) wardrobe = createWardrobe(outfit.colorHex, outfit.tone);
    else wardrobe.setColor(outfit.colorHex, outfit.tone);
    mannequin = buildMannequin(b, wardrobe.skin, wardrobe.metal);
    garment = buildGarment(outfit.style, b, wardrobe);
    root.add(mannequin.group, garment.group);
    placePrint();
  }

  function loop(now: number) {
    raf = 0;
    if (disposed) return;
    inLoop = true;
    let animating = false;
    if (faceAnim) {
      const t = Math.min(1, (now - faceAnim.start) / faceAnim.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      setAzimuth(faceAnim.from + (faceAnim.to - faceAnim.from) * e);
      animating = t < 1;
      if (!animating) faceAnim = null;
    }
    const moved = controls.update();
    renderer.render(scene, camera);
    while (frameWaiters.length) frameWaiters.shift()!();
    inLoop = false;
    if (controls.autoRotate || moved || animating) raf = requestAnimationFrame(loop);
  }

  // Render only while something is moving, to spare the phone's battery.
  function kick() {
    if (!raf && !inLoop && !disposed) raf = requestAnimationFrame(loop);
  }

  function setAzimuth(theta: number) {
    const offset = camera.position.clone().sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.theta = theta;
    offset.setFromSpherical(s);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  }

  controls.addEventListener('change', kick);
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    faceAnim = null;
    opts.onInteract?.();
    kick();
  });

  const resizer = new ResizeObserver(() => {
    fitCamera();
    kick();
  });
  if (canvas.parentElement) resizer.observe(canvas.parentElement);

  return {
    setOutfit(o) {
      const needsRebuild = !outfit || o.style !== outfit.style || o.fit !== outfit.fit;
      const fitChanged = !outfit || o.fit !== outfit.fit;
      outfit = o;
      if (needsRebuild) rebuild();
      else wardrobe?.setColor(o.colorHex, o.tone);
      if (fitChanged) fitCamera();
      kick();
    },
    setPrint(image, placement) {
      setSlot(slots.front, image, { ...placement, side: 'front' });
    },
    setBackPrint(image, placement) {
      setSlot(slots.back, image, { ...placement, side: 'back' });
    },
    face(side) {
      controls.autoRotate = false;
      const offset = camera.position.clone().sub(controls.target);
      const current = new THREE.Spherical().setFromVector3(offset).theta;
      const goal = side === 'front' ? 0 : side === 'back' ? Math.PI : Math.PI / 4.5;
      // Take the short way round.
      let to = goal;
      while (to - current > Math.PI) to -= Math.PI * 2;
      while (current - to > Math.PI) to += Math.PI * 2;
      faceAnim = { from: current, to, start: performance.now(), dur: 750 };
      kick();
    },
    spin(on) {
      controls.autoRotate = on;
      faceAnim = null;
      kick();
    },
    isSpinning: () => controls.autoRotate,
    frame() {
      return new Promise<void>((resolve) => {
        frameWaiters.push(resolve);
        kick();
      });
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resizer.disconnect();
      controls.dispose();
      clearPrint();
      garment?.dispose();
      mannequin?.dispose();
      wardrobe?.dispose();
      for (const slot of [slots.front, slots.back]) {
        slot.texture?.dispose();
        slot.material?.dispose();
      }
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
