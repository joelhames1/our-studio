'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { Icon } from '@/components/Icon';
import { BottomBar, Button, PageTitle } from '@/components/ui';
import { toast } from '@/components/Toast';
import { usePrefs } from '@/lib/client/prefs';
import { sampleFor, vibesFor } from '@/lib/design/vibes';

export default function VibePage() {
  const { state, saveBrief, remix } = useProject();
  const [prefs] = usePrefs();
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(state.project.brief.vibes);
  const [busy, setBusy] = useState(false);
  const copy = state.project.brief.copy;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));

  const go = async () => {
    setBusy(true);
    try {
      const changed = picked.join() !== state.project.brief.vibes.join();
      if (changed) {
        await saveBrief({ vibes: picked });
        await remix(null, 8);
      }
      router.push(`/p/${state.project.id}/browse`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="animate-pop">
      <PageTitle kicker="Step 1" title="What's the vibe?" sub="Tap up to three. New designs will lean this way. (You can skip this.)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        {vibesFor(state.occasions).map((v) => {
          const on = picked.includes(v.id);
          return (
            <button
              key={v.id}
              onClick={() => toggle(v.id)}
              aria-pressed={on}
              className={`relative overflow-hidden rounded-3xl bg-white text-left shadow-[var(--shadow-card)] transition active:scale-[0.98] ${
                on ? 'ring-[3px] ring-lagoon' : 'ring-1 ring-transparent'
              }`}
            >
              <div className="bg-sand-2/70 px-4 pt-3">
                <ShirtPreview design={sampleFor(v, state.occasions)} copy={copy} style={prefs.style} color={prefs.color} />
              </div>
              <div className="px-3.5 pb-3.5 pt-2.5">
                <div className="font-medium leading-tight">{v.name}</div>
                <div className="mt-0.5 text-[13px] leading-snug text-muted">{v.blurb}</div>
              </div>
              {on ? (
                <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-lagoon text-white shadow">
                  <Icon name="check" size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <BottomBar>
        <div className="lg:mx-auto lg:max-w-md">
          <Button size="lg" className="w-full" onClick={go} busy={busy} icon="sparkles">
            {picked.length ? `Show me ${picked.length === 1 ? 'that vibe' : 'these vibes'}` : 'Surprise me with everything'}
          </Button>
        </div>
      </BottomBar>
    </div>
  );
}
