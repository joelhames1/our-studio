'use client';
import { useEffect, useState } from 'react';
import { useProject } from './ProjectProvider';
import { Button } from './ui';
import { Sheet } from './Sheet';
import { toast } from './Toast';
import { http } from '@/lib/client/http';
import { artIdeaExamples } from '@/lib/design/examples';
import type { ShirtOption } from '@/lib/server/studio';

const WAITING = ['Mixing the paint…', 'Sketching it out…', 'Trying a few colors…', 'Adding the details…', 'Almost there…'];

/** Asks the AI artist for brand-new artwork (about 30 seconds). */
export function NewArtButton({ basedOn, label = 'New artwork', variant = 'coral' }: { basedOn?: ShirtOption; label?: string; variant?: 'coral' | 'secondary' }) {
  const { state, addOptions } = useProject();
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 4500);
    return () => clearInterval(t);
  }, [busy]);

  if (!state.ai.art) {
    return state.me.admin ? (
      <p className="text-center text-xs text-muted">AI artwork turns on once an image key is added in Setup.</p>
    ) : null;
  }

  const go = async () => {
    setBusy(true);
    setTick(0);
    try {
      const res = await http<{ options: ShirtOption[] }>(`/api/projects/${state.project.id}/art`, {
        body: { idea, basedOn: basedOn?.id ?? null },
      });
      addOptions(res.options);
      toast(`${res.options.length} new design${res.options.length === 1 ? '' : 's'} with fresh artwork`);
      setOpen(false);
      setIdea('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="lg" variant={variant} icon="sparkles" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title="New artwork">
        <p className="mb-3 text-[15px] text-muted">
          An AI artist paints something new in the styles you picked. Want anything in particular?
        </p>
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={`Optional: ${artIdeaExamples(state.occasions).map((i) => `“${i}”`).join(', ')}`}
          className="mb-4 h-12 w-full rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
        />
        <Button size="lg" className="mb-2 w-full" onClick={go} busy={busy} icon={busy ? undefined : 'sparkles'}>
          {busy ? WAITING[tick % WAITING.length] : 'Paint something new'}
        </Button>
        <p className="pb-2 text-center text-xs text-muted">Takes about 30 seconds. The words are added afterwards, so they’re always spelled right.</p>
      </Sheet>
    </>
  );
}
