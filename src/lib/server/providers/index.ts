import 'server-only';
import { Resvg } from '@resvg/resvg-js';
import { motifSvg } from '@/lib/design/motifs';
import { inksFor, PALETTES } from '@/lib/design/palettes';
import type { MotifId } from '@/lib/design/types';
import { config } from '../config';
import { drawSvg } from '../llm/tasks';
import { falProvider } from './fal';
import { openaiProvider } from './openai';
import { sanitizeSvg } from './svg';
import { timeLeft, type ArtRequest, type ImageProvider } from './types';

/** Claude draws vector art: no extra account, razor sharp, simpler look. */
const claudeSvgProvider: ImageProvider = {
  id: 'claude-svg',
  label: 'Claude (vector art)',
  get model() {
    return config.anthropicModel;
  },
  // drawSvg's Claude call holds and records its own cost.
  estimateUsd: 0,
  async generate(req: ArtRequest) {
    const svg = sanitizeSvg(await drawSvg(req.subject ?? req.prompt, req.styles ?? [], req.colors ?? ['#12355B', '#F2654E', '#FFD166', '#3CC8C8'], timeLeft(req, 150_000)));
    return { data: Buffer.from(svg), type: 'svg', usd: 0 };
  },
  async ping() {
    return 'Claude is connected and will draw vector artwork.';
  },
};

/** For tests and demos: paints built-in scenes as PNGs. Free and instant. */
const mockProvider: ImageProvider = {
  id: 'mock',
  label: 'Built-in practice artist',
  model: 'mock',
  estimateUsd: 0,
  async generate(req: ArtRequest) {
    const suits = req.motifs?.filter((m) => m !== 'none');
    const scenes: MotifId[] = suits?.length ? suits : ['sunset-palm', 'bungalow-sunset', 'hourglass-island', 'palm-duo', 'plane-sun', 'sunset-clock'];
    let h = 0;
    for (const ch of req.prompt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const scene = scenes[h % scenes.length];
    // Unsigned shift: h can be past 2^31, and a signed one would make a negative index.
    const palette = PALETTES[(h >>> 3) % PALETTES.length];
    const inks = inksFor(palette.id, { hex: '#F7F6F2', tone: 'light' });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${motifSvg(scene, inks)}</svg>`;
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
    return { data: Buffer.from(png), type: 'png', usd: 0 };
  },
  async ping() {
    return 'Practice artist (no image key yet): uses built-in scenes so you can try the flow.';
  },
};

export function getImageProvider(): ImageProvider {
  switch (config.imageProvider) {
    case 'fal':
      return falProvider;
    case 'openai':
      return openaiProvider;
    case 'claude-svg':
      return claudeSvgProvider;
    default:
      return mockProvider;
  }
}

/**
 * The services to try for one painting, in order: the chosen one, then any
 * other with a key (fal.ai, OpenAI, Claude's vector art), so one service
 * being down doesn't mean no new artwork. The practice artist never hands
 * over to a paid one.
 */
export function imageProviders(): ImageProvider[] {
  const first = getImageProvider();
  if (first.id === 'mock') return [first];
  const others: [boolean, ImageProvider][] = [
    [!!config.falKey, falProvider],
    [!!config.openaiKey, openaiProvider],
    [!!config.anthropicKey, claudeSvgProvider],
  ];
  return [first, ...others.filter(([has, p]) => has && p.id !== first.id).map(([, p]) => p)];
}

export type { ImageProvider };
