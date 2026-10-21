'use client';
import { useEffect, useRef } from 'react';
import { designCanvas } from '@/lib/client/designTexture';
import { loadFonts } from '@/lib/client/fonts';
import { garmentColor } from '@/lib/design/palettes';
import { SEED_COPY, SEED_DESIGN } from '@/lib/design/seed';
import type { GarmentStyle } from '@/lib/design/types';
import type { Stage } from '@/lib/three/stage';

declare global {
  interface Window {
    __stage?: Stage;
    __labReady?: boolean;
  }
}

export function Lab3D() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const style = (q.get('style') ?? 'tee') as GarmentStyle;
    const color = garmentColor(q.get('color') ?? 'white');
    const fit = q.get('fit') === 'erin' ? 'erin' : 'joel';
    const angle = (q.get('angle') ?? 'front') as 'front' | 'back' | 'three-quarter';
    let stage: Stage | null = null;
    (async () => {
      const { createStage } = await import('@/lib/three/stage');
      stage = createStage(canvas.current!);
      stage.spin(false);
      stage.setOutfit({ style, colorHex: color.hex, tone: color.tone, fit });
      const fonts = await loadFonts();
      const c = await designCanvas(SEED_DESIGN, SEED_COPY, color, fonts);
      stage.setPrint(c, { widthIn: style === 'hoodie' ? 10 : 12, placement: q.get('placement') === 'chest' ? 'left-chest' : 'center' });
      stage.face(angle);
      await new Promise((r) => setTimeout(r, 900));
      await stage.frame();
      window.__stage = stage;
      window.__labReady = true;
    })();
    return () => stage?.dispose();
  }, []);
  return (
    <div style={{ width: 480, height: 600, background: 'radial-gradient(ellipse at 50% 35%, #fff 0%, #f4ede1 55%, #e9dfcf 100%)' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
