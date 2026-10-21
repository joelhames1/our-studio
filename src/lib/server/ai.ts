// Wires Claude into the tweak flow when a key is present. Imported by the
// routes that need it; keyword matching remains the fallback.
import { vibe } from '@/lib/design/vibes';
import { paintForTweak } from './art';
import { config } from './config';
import { rateLimit } from './limits';
import { interpretTweak } from './llm/tasks';
import { setTweakInterpreter } from './tweaks';
import { getShirtProject, occasionsOf } from './studio';
import { motifsFor } from '@/lib/design/occasions';

setTweakInterpreter(async (base, request, ctx) => {
  if (!config.anthropicKey) return null;
  const result = await interpretTweak(base, request, ctx.copy ?? { headline: '', tagline: '', extra: '' }, config.imageProvider !== 'mock', ctx.about, ctx.shirt);
  if (!result) return null;
  if (result.newArtwork && ctx.projectId) {
    // New artwork is new artwork, however it's asked for: it counts against the artwork limit, not just Claude's.
    if (ctx.user) await rateLimit(ctx.user, 'art');
    const project = await getShirtProject(ctx.projectId);
    const styles = project.brief.vibes.map((v) => vibe(v)?.artStyle).filter((s): s is string => !!s);
    const art = await paintForTweak(ctx.projectId, result.newArtwork, result.design.palette, styles, motifsFor(occasionsOf(project)));
    if (art) {
      result.design.art = art;
      if (result.design.layout === 'ticket' || result.design.layout === 'bigtype') result.design.layout = 'stack';
      result.changes.push(`new artwork: ${result.newArtwork}`);
    }
  }
  return { design: result.design, changes: result.changes };
});
