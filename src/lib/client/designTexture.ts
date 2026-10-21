'use client';
// Turns a design into a transparent canvas for the 3D print. It uses the same
// renderer as everything else, so the 3D shirt shows exactly what prints.
import { renderDesign } from '@/lib/design/render';
import { CANVAS, type Copy, type FontSet, type ShirtDesign, type Tone } from '@/lib/design/types';

const ASSET_HREF = /href="(\/api\/assets\/[^"]+)"/g;

/**
 * An SVG drawn into a canvas can't load external images, so AI artwork is
 * swapped for inline data URIs first.
 */
export async function inlineAssets(svg: string, fetchDataUri: (url: string) => Promise<string>): Promise<string> {
  const urls = [...new Set([...svg.matchAll(ASSET_HREF)].map((m) => m[1]))];
  if (!urls.length) return svg;
  const map = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      try {
        map.set(u, await fetchDataUri(u.replace(/&amp;/g, '&')));
      } catch {
        // Leave it; the print just shows without that artwork.
      }
    }),
  );
  return svg.replace(ASSET_HREF, (whole, u: string) => (map.has(u) ? `href="${map.get(u)}"` : whole));
}

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function designCanvas(
  design: ShirtDesign,
  copy: Copy,
  shirt: { hex: string; tone: Tone },
  fonts: FontSet,
  width = 1024,
): Promise<HTMLCanvasElement> {
  const inner = renderDesign(design, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k) => `/api/assets/${k}` });
  return canvasFromMarkup(inner, width);
}

/** Draws canvas markup (1500 x 1800 units) into a transparent canvas. */
export async function canvasFromMarkup(inner: string, width = 1024): Promise<HTMLCanvasElement> {
  const height = Math.round((width * CANVAS.h) / CANVAS.w);
  const svg = await inlineAssets(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${width}" height="${height}">${inner}</svg>`,
    fetchAsDataUri,
  );
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
