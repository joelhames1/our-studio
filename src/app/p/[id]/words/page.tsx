'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { BottomBar, Button, PageTitle } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import type { Copy } from '@/lib/design/types';

export default function WordsPage() {
  const { state, saveBrief, myReaction, setState } = useProject();
  const [prefs] = usePrefs();
  const router = useRouter();
  const brief = state.project.brief;
  const [copy, setCopy] = useState<Copy>(brief.copy);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [hint, setHint] = useState('');

  const featured = useMemo(() => {
    const loved = state.options.find((o) => myReaction(o.id) === 'love' && !o.payload.copyOverride);
    return loved ?? state.options.find((o) => o.source === 'seed') ?? state.options[0];
  }, [state.options, myReaction]);

  const ideas = useMemo(() => {
    const seen = new Set<string>();
    return brief.copyIdeas.filter((c) => {
      const k = `${c.headline}|${c.tagline}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [brief.copyIdeas]);

  const dirty = copy.headline !== brief.copy.headline || copy.tagline !== brief.copy.tagline || copy.extra !== brief.copy.extra;

  const save = async () => {
    if (!copy.headline.trim()) return toast('The big words can’t be empty', 'error');
    setBusy(true);
    try {
      await saveBrief({ copy });
      toast('Saved. Every design now uses these words.');
      router.push(`/p/${state.project.id}/browse`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const askClaude = async () => {
    setAsking(true);
    try {
      const next = await http<typeof state>(`/api/projects/${state.project.id}/words`, { body: { hint } });
      setState(next);
      toast('Fresh ideas added below');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setAsking(false);
    }
  };

  const example = state.project.brief.copyIdeas.find((c) => c.headline !== copy.headline) ?? state.project.brief.copy;
  const field = (key: keyof Copy, label: string, placeholder: string, multiline = false) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">{label}</span>
      {multiline ? (
        <textarea
          value={copy[key]}
          onChange={(e) => setCopy({ ...copy, [key]: e.target.value })}
          rows={2}
          placeholder={placeholder}
          className="w-full resize-none rounded-2xl bg-white px-4 py-3 text-[17px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
        />
      ) : (
        <input
          value={copy[key]}
          onChange={(e) => setCopy({ ...copy, [key]: e.target.value })}
          placeholder={placeholder}
          className="h-12 w-full rounded-2xl bg-white px-4 text-[17px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
        />
      )}
    </label>
  );

  return (
    <div className="animate-pop">
      <PageTitle title="The words" sub="Change anything. The preview updates as you type, spelled exactly as it'll print." />

      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        <div className="mb-5 rounded-3xl bg-gradient-to-b from-lagoon-soft to-sand-2 px-12 pt-5 shadow-[var(--shadow-card)] lg:sticky lg:top-32 lg:mb-0">
          {featured ? <ShirtPreview design={featured.payload} copy={copy} style={prefs.style} color={prefs.color} /> : null}
        </div>

        <div>
          <div className="space-y-4">
            {field('headline', 'Big words', example.headline || 'The big words', true)}
            {field('tagline', 'Small words', example.tagline || 'The smaller line')}
            {field('extra', 'Tiny line (optional)', example.extra || 'A place and a year')}
            <p className="text-[13px] text-muted">
              Tips: put a word in &quot;quotes&quot; to make it pop. Press Enter in the big words to choose where the line breaks.
            </p>
          </div>

          <h2 className="mb-2 mt-8 font-display text-xl font-semibold">Other ideas</h2>
          <div className="space-y-2">
            {ideas.map((c) => (
              <button
                key={`${c.headline}|${c.tagline}`}
                onClick={() => setCopy(c)}
                className="block w-full rounded-2xl bg-white px-4 py-3 text-left shadow-[var(--shadow-card)] transition active:scale-[0.99]"
              >
                <span className="block font-medium">{c.headline}</span>
                <span className="block text-sm text-muted">
                  {c.tagline}
                  {c.extra ? ` · ${c.extra}` : ''}
                </span>
              </button>
            ))}
          </div>

          {state.ai.words ? (
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Icon name="sparkles" size={18} className="text-lagoon" /> Ask Claude for more
              </div>
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder={`Optional: “funnier”, “shorter”, “mention ${state.facts.place.name || state.facts.dates || 'the year'}”…`}
                className="mb-3 h-11 w-full rounded-xl bg-sand px-3.5 text-[15px] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
              />
              <Button variant="secondary" onClick={askClaude} busy={asking} icon="sparkles" className="w-full">
                Suggest new words
              </Button>
            </div>
          ) : null}

          <BottomBar>
            <div className="flex gap-2">
              {dirty ? (
                <Button variant="secondary" size="lg" onClick={() => setCopy(brief.copy)} icon="undo">
                  Undo
                </Button>
              ) : null}
              <Button size="lg" className="flex-1" onClick={dirty ? save : () => router.push(`/p/${state.project.id}/browse`)} busy={busy} icon={dirty ? 'check' : 'heart'}>
                {dirty ? 'Use these words' : 'Looks good, browse designs'}
              </Button>
            </div>
          </BottomBar>
        </div>
      </div>
    </div>
  );
}
