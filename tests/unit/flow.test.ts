// End-to-end through the server logic: seed, remix, react, approve, build the print package.
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { tempRepo } from './helpers';
import { USERS } from '@/lib/server/auth';
import { ensureSeed, projectState, react, remix, SEED_PROJECT_ID } from '@/lib/server/studio';
import { approve, buildPackage, reopen } from '@/lib/server/decisions';
import { tweakOption } from '@/lib/server/tweaks';

describe('the whole flow', () => {
  it('goes from seed to a print-ready package', async () => {
    const { repo } = tempRepo();
    await ensureSeed();
    await ensureSeed(); // idempotent

    const erin = USERS.erin;
    const joel = USERS.joel;
    let state = await projectState(SEED_PROJECT_ID, erin);
    expect(state.options.length).toBe(16);
    const seed = state.options.find((o) => o.source === 'seed')!;
    expect(seed.label).toBe('The original idea');

    const more = await remix(erin, SEED_PROJECT_ID, seed.id, 4);
    expect(more).toHaveLength(4);
    expect(more.every((o) => o.parentId === seed.id)).toBe(true);

    const tweaked = await tweakOption(erin, SEED_PROJECT_ID, seed.id, 'more blue');
    expect(tweaked.option.payload.palette).toBe('lagoon');

    await react(erin, SEED_PROJECT_ID, seed.id, 'love');
    await react(joel, SEED_PROJECT_ID, seed.id, 'love');
    await react(joel, SEED_PROJECT_ID, more[0].id, 'pass');

    // Erin sees Joel's hearts, never his passes.
    state = await projectState(SEED_PROJECT_ID, erin);
    expect(state.reactions.some((r) => r.userId === 'joel' && r.value === 'love')).toBe(true);
    expect(state.reactions.some((r) => r.userId === 'joel' && r.value === 'pass')).toBe(false);

    const input = { optionId: seed.id, garment: 'tee' as const, color: 'navy', preset: 'standard', sizes: [{ who: 'Erin', size: 'M', qty: 1 }, { who: 'Joel', size: 'L', qty: 2 }], notes: 'By March 20' };
    await expect(approve(joel, SEED_PROJECT_ID, input)).rejects.toThrow(/Erin/);
    const decision = await approve(erin, SEED_PROJECT_ID, input);
    expect(decision.status).toBe('building');
    await expect(approve(erin, SEED_PROJECT_ID, input)).rejects.toThrow(/Already approved/);

    const built = await buildPackage(decision.id);
    expect(built.status).toBe('ready');
    const names = built.files!.map((f) => f.name);
    expect(names).toContain('print-file-front-12x14.4in.png');
    expect(names).toContain('order-sheet.pdf');
    expect(names).toContain('extras/master-15x18in-4500x5400.png');

    const main = (await repo.getAsset(built.files!.find((f) => f.name.startsWith('print-file'))!.key))!.data;
    const meta = await sharp(main).metadata();
    expect([meta.width, meta.height, meta.density, meta.hasAlpha]).toEqual([3600, 4320, 300, true]);
    const { data, info } = await sharp(main).raw().toBuffer({ resolveWithObject: true });
    let semi = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] !== 0 && data[i] !== 255) semi++;
    expect(semi).toBe(0);

    const zip = unzipSync(new Uint8Array((await repo.getAsset(built.files![0].key))!.data));
    expect(Object.keys(zip).some((k) => k.endsWith('README.txt'))).toBe(true);
    const pdf = (await repo.getAsset(built.files!.find((f) => f.name === 'order-sheet.pdf')!.key))!.data;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    await reopen(erin, SEED_PROJECT_ID);
    state = await projectState(SEED_PROJECT_ID, erin);
    expect(state.project.status).toBe('exploring');
    expect(state.decision).toBeNull();
  }, 120_000);
});

describe('the practice artist', () => {
  it('paints for any idea, whatever its words hash to', async () => {
    // Always the practice artist here, never a paid one.
    const before = process.env.IMAGE_PROVIDER;
    process.env.IMAGE_PROVIDER = 'mock';
    const { getImageProvider } = await import('@/lib/server/providers');
    expect(getImageProvider().id).toBe('mock');
    // Several of these hash past 2^31, which once picked no palette at all.
    const prompts = ['a yellow tram climbing a steep cobbled hill', 'terracotta rooftops above a river', 'a row of sardines swimming in formation', 'blue and white painted tiles with a sunburst', 'a paper boat', 'a hot air balloon'];
    for (const prompt of prompts) {
      const out = await getImageProvider().generate({ prompt, subject: prompt, styles: [], colors: [] });
      expect(out.type).toBe('png');
    }
    if (before === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = before;
  });
});
