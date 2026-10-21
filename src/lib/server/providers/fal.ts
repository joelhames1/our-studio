// fal.ai: one key for image models, upscaling and background removal.
import sharp from 'sharp';
import { config } from '../config';
import { PRINT_RULES, type ArtRequest, type ArtResult, type ImageProvider } from './types';

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

/** What fal said went wrong, in its own words where it gives them ({"detail":[{"msg":…}]}), not the whole reply. */
function falSays(text: string): string {
  try {
    const { detail } = JSON.parse(text) as { detail?: unknown };
    const said = Array.isArray(detail)
      ? detail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String(d.msg) : '')).filter(Boolean).join(' ')
      : typeof detail === 'string'
        ? detail
        : '';
    if (said) return said.slice(0, 300);
  } catch {
    // Not JSON: show the start of it as it is.
  }
  return text.slice(0, 300);
}

/**
 * One fal job. `sync_mode` asks for the result inline as a data URI, so fal doesn't
 * keep a copy at a public link or in its request history. A model that ignores it
 * still answers with a link, which `download` accepts from fal's own hosts.
 */
async function falRun<T>(model: string, input: Record<string, unknown>, timeoutMs = 240_000): Promise<T> {
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${config.falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, sync_mode: true }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('fal.ai rejected the key. Check FAL_KEY in Setup.');
    throw new Error(`fal.ai ${model} failed (${res.status}): ${falSays(await res.text())}`);
  }
  return (await res.json()) as T;
}

/** Results only ever come from fal's own hosts, and never bigger than this. */
const FAL_HOST = /(^|\.)(fal\.media|fal\.run|fal\.ai)$/i;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

export async function download(url: string): Promise<Buffer> {
  if (url.startsWith('data:image/')) {
    const comma = url.indexOf(',');
    if (comma < 0 || !url.slice(0, comma).endsWith(';base64')) throw new Error('fal.ai sent back a broken image.');
    if ((url.length - comma) * 0.75 > MAX_IMAGE_BYTES) throw new Error('fal.ai sent an image that was too big.');
    const buf = Buffer.from(url.slice(comma + 1), 'base64');
    if (buf.length > MAX_IMAGE_BYTES) throw new Error('fal.ai sent an image that was too big.');
    return buf;
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('fal.ai sent back a broken image link.');
  }
  if (u.protocol !== 'https:' || !FAL_HOST.test(u.hostname)) throw new Error(`fal.ai sent an image from an unexpected place (${u.hostname}).`);
  const res = await fetch(u, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new Error('fal.ai sent an image that was too big.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('fal.ai sent an image that was too big.');
  return buf;
}

const asDataUri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

export const falProvider: ImageProvider = {
  id: 'fal',
  label: 'fal.ai',
  get model() {
    return config.falImageModel;
  },
  get estimateUsd() {
    return config.costPerImageUsd;
  },

  async generate(req: ArtRequest): Promise<ArtResult> {
    const model = config.falImageModel;
    const isGptImage = model.includes('gpt-image');
    const input: Record<string, unknown> = isGptImage
      ? { prompt: `${req.prompt}\n\n${PRINT_RULES}`, image_size: '1024x1536', background: 'transparent', quality: config.imageQuality, output_format: 'png', num_images: 1 }
      : { prompt: `${req.prompt}. ${PRINT_RULES}`, image_size: 'portrait_4_3', num_images: 1 };
    const out = await falRun<{ images: FalImage[] }>(model, input);
    const first = out.images?.[0];
    if (!first?.url) throw new Error('fal.ai returned no image.');
    let png: Buffer = await sharp(await download(first.url)).png().toBuffer();
    if (!isGptImage) png = await this.removeBackground!(png);
    return { data: png, type: 'png', usd: config.costPerImageUsd };
  },

  /** 4x ESRGAN on the colors; the transparency mask is resampled and re-attached. */
  async upscale(png: Buffer): Promise<Buffer> {
    const meta = await sharp(png).metadata();
    const out = await falRun<{ image: FalImage }>(config.falUpscaleModel, { image_url: asDataUri(png), scale: 4, output_format: 'png' });
    const big = await download(out.image.url);
    const bigMeta = await sharp(big).metadata();
    if (bigMeta.hasAlpha || !meta.hasAlpha) return sharp(big).png().toBuffer();
    const alpha = await sharp(png).extractChannel('alpha').resize(bigMeta.width, bigMeta.height, { kernel: 'lanczos3' }).toBuffer();
    return sharp(big).removeAlpha().joinChannel(alpha).png().toBuffer();
  },

  async removeBackground(png: Buffer): Promise<Buffer> {
    const out = await falRun<{ image: FalImage }>(config.falBackgroundModel, { image_url: asDataUri(png) });
    return sharp(await download(out.image.url)).png().toBuffer();
  },

  async ping() {
    // A tiny background-removal job is the cheapest real call that proves the key works.
    // The model refuses anything under 32 × 32, so this stays comfortably above that.
    const dot = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    await falRun(config.falBackgroundModel, { image_url: asDataUri(dot) }, 60_000);
    return `fal.ai key works (art model: ${config.falImageModel})`;
  },
};
