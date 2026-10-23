'use client';
import { useState } from 'react';
import { vibesFor } from '@/lib/design/vibes';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';
import { toast } from './Toast';
import { Button } from './ui';

/** How many new designs a change of style makes. */
export const STYLE_BATCH = 8;

/** The styles picked for a project (up to three), and making new designs that lean that way. */
export function useStylePick() {
  const { state, saveBrief, remix } = useProject();
  const [picked, setPicked] = useState<string[]>(state.project.brief.vibes);
  const [busy, setBusy] = useState(false);
  const changed = picked.join() !== state.project.brief.vibes.join();
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
  /** Saves the styles and makes new designs in them. False if nothing changed or it didn't work. */
  const apply = async (): Promise<boolean> => {
    if (!changed) return false;
    setBusy(true);
    try {
      await saveBrief({ vibes: picked });
      const made = await remix(null, STYLE_BATCH);
      toast(`${made.length} new designs, up next`);
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { picked, toggle, changed, apply, busy, styles: vibesFor(state.occasions) };
}

/** Styles as chips: at the end of Browse, and beside it on a laptop. */
export function StyleChips({ title = 'Lean toward a style' }: { title?: string }) {
  const { picked, toggle, changed, apply, busy, styles } = useStylePick();
  return (
    <section aria-label={title}>
      <h2 className="mb-1 font-display text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">Pick up to three and new designs lean that way.</p>
      <div className="flex flex-wrap gap-2">
        {styles.map((v) => {
          const on = picked.includes(v.id);
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={on}
              title={v.blurb}
              onClick={() => toggle(v.id)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition ${on ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-line'}`}
            >
              {on ? <Icon name="check" size={14} /> : null}
              {v.name}
            </button>
          );
        })}
      </div>
      {changed ? (
        <Button className="mt-3" size="sm" icon="sparkles" onClick={() => void apply()} busy={busy}>
          {picked.length ? `Make ${STYLE_BATCH} in ${picked.length === 1 ? 'this style' : 'these styles'}` : `Make ${STYLE_BATCH} in any style`}
        </Button>
      ) : null}
    </section>
  );
}
