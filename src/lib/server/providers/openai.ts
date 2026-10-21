// OpenAI GPT Image: good prompt-following and native transparent backgrounds.
// No AI upscaler here; print export falls back to high-quality resampling.
import { config } from '../config';
import { PRINT_RULES, type ArtRequest, type ArtResult, type ImageProvider } from './types';

async function openai<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${config.openaiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new Error('OpenAI rejected the key. Check OPENAI_API_KEY in Setup.');
    throw new Error(`OpenAI ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

export const openaiProvider: ImageProvider = {
  id: 'openai',
  label: 'OpenAI',
  get model() {
    return config.openaiImageModel;
  },
  get estimateUsd() {
    return config.costPerImageUsd;
  },
  async generate(req: ArtRequest): Promise<ArtResult> {
    const out = await openai<{ data: { b64_json: string }[] }>('images/generations', {
      model: config.openaiImageModel,
      prompt: `${req.prompt}\n\n${PRINT_RULES}`,
      n: 1,
      size: '1024x1536',
      background: 'transparent',
      quality: config.imageQuality,
      output_format: 'png',
    });
    const b64 = out.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image.');
    return { data: Buffer.from(b64, 'base64'), type: 'png', usd: config.costPerImageUsd };
  },
  async ping() {
    await openai('models');
    return `OpenAI key works (art model: ${config.openaiImageModel})`;
  },
};
