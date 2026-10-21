// Wires Claude into the tweak flow when a key is present. Imported by the
// routes that need it; keyword matching remains the fallback.
import { vibe } from '@/lib/design/vibes';
import { PAINT_BUDGET_MS, paintForTweak } from './art';
import { HttpError } from './auth';
import { config } from './config';
import { rateLimit } from './limits';
import { interpretTweak } from './llm/tasks';
import { setTweakInterpreter } from './tweaks';
import { getShirtProject, occasionsOf } from './studio';
import { motifsFor } from '@/lib/design/occasions';

setTweakInterpreter(async (base, request, ctx) => {
  if (!config.anthropicKey) return null;
  // Counted from the start of the tweak, so Claude's turn and the painting together fit the route's time.
  const deadline = Date.now() + PAINT_BUDGET_MS;
  const result = await interpretTweak(base, request, ctx.copy ?? { headline: '', tagline: '', extra: '' }, config.imageProvider !== 'mock', ctx.about, ctx.shirt);
  if (!result) return null;
  if (result.newArtwork && ctx.projectId) {
    try {
      // New artwork is new artwork, however it's asked for: it counts against the artwork limit, not just Claude's.
      if (ctx.user) await rateLimit(ctx.user, 'art');
      const project = await getShirtProject(ctx.projectId);
      const styles = project.brief.vibes.map((v) => vibe(v)?.artStyle).filter((s): s is string => !!s);
      const art = await paintForTweak(ctx.projectId, result.newArtwork, result.design.palette, styles, motifsFor(occasionsOf(project)), deadline);
      if (art) {
        result.design.art = art;
        if (result.design.layout === 'ticket' || result.design.layout === 'bigtype') result.design.layout = 'stack';
        result.changes.push(`new artwork: ${result.newArtwork}`);
      }
    } catch (e) {
      // The painting is only part of it: keep the rest ("coral words" still happens without the dog). If the
      // painting was all they asked for, say why it didn't happen instead.
      if (JSON.stringify(result.design) === JSON.stringify(base)) throw e;
      console.error('Painting for a tweak failed; keeping the other changes', e);
      result.changes.push(paintingSkipped(e));
    }
  }
  return { design: result.design, changes: result.changes };
});

/** What goes in the summary when the rest of a tweak happened but its new artwork didn't. */
function paintingSkipped(e: unknown): string {
  if (e instanceof HttpError && e.status === 402) return 'no new artwork (the AI budget is used up)';
  if (e instanceof HttpError && e.status === 429) return 'no new artwork for now (that’s a lot of artwork in a short while)';
  return 'couldn’t paint new artwork just now';
}
