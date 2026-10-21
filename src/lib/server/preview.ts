import 'server-only';
import sharp from 'sharp';
import { PREVIEW_WIDTH } from '@/lib/design/preview';

/**
 * A painting at screen size, transparency kept: lossy for a painterly image,
 * lossless for flat colors (which squeeze smaller that way), whichever is
 * smaller.
 */
export async function makePreview(png: Buffer): Promise<Buffer> {
  const small = sharp(png).resize({ width: PREVIEW_WIDTH, withoutEnlargement: true });
  const [lossy, lossless] = await Promise.all([small.clone().webp({ quality: 82, alphaQuality: 90 }).toBuffer(), small.clone().webp({ lossless: true }).toBuffer()]);
  return lossy.length <= lossless.length ? lossy : lossless;
}
