'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ShirtPreview } from '@/components/ShirtPreview';
import { toast } from '@/components/Toast';
import { BottomBar, Button, PageTitle } from '@/components/ui';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import type { Facts, Occasion } from '@/lib/design/back/types';
import { OCCASION_PRESETS, preset, suggestedTitle, type Basics } from '@/lib/design/occasions';
import type { Copy } from '@/lib/design/types';

type Step = 'occasion' | 'basics' | 'words';

interface Draft {
  occasion: Occasion;
  basics: Basics;
  ideas: Copy[];
  context: string;
  facts: Partial<Pick<Facts, 'stops' | 'statement' | 'place'>>;
}

const EMPTY: Basics = { title: '', people: [], dates: '', number: '', year: '', place: '' };
// Examples sit pale behind "e.g." so an empty box never looks filled in.
const input =
  'h-12 w-full rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line placeholder:text-ink/30 focus:ring-2 focus:ring-lagoon';
const eg = (s?: string) => (s ? `e.g. ${s}` : undefined);

/** Start something new: what it is, the basics, then the words. */
export function NewProject({ ai, start }: { ai: boolean; start?: Occasion }) {
  const router = useRouter();
  const [prefs] = usePrefs();
  const [step, setStep] = useState<Step>(start ? 'basics' : 'occasion');
  const [occasion, setOccasion] = useState<Occasion | null>(start ?? null);
  const [basics, setBasics] = useState<Basics>(EMPTY);
  const [people, setPeople] = useState('');
  const [ideas, setIdeas] = useState<Copy[]>([]);
  const [pick, setPick] = useState(0);
  const [copy, setCopy] = useState<Copy>({ headline: '', tagline: '', extra: '' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [describe, setDescribe] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Next was pressed with no name yet: say so beside the box rather than greying the button out.
  const [nameMissing, setNameMissing] = useState(false);
  const titleField = useRef<HTMLInputElement>(null);
  const p = occasion ? preset(occasion) : null;

  const filled = (): Basics => ({ ...basics, people: people.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean) });
  const suggestion = occasion ? suggestedTitle(occasion, filled()) : null;

  const choose = (o: Occasion) => {
    setOccasion(o);
    setStep('basics');
    window.scrollTo({ top: 0 });
  };

  const fillIn = async () => {
    setBusy('draft');
    try {
      const res = await http<{ draft: Draft }>('/api/projects/draft', { body: { text: describe } });
      const d = res.draft;
      setDraft(d);
      setOccasion(d.occasion);
      setBasics(d.basics);
      setPeople(d.basics.people.join(', '));
      setStep('basics');
      window.scrollTo({ top: 0 });
      toast('Filled in. Check it over, then pick the words.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const toWords = () => {
    if (!p) return;
    if (!basics.title.trim()) {
      setNameMissing(true);
      titleField.current?.focus();
      return;
    }
    const b = filled();
    const seen = new Set<string>();
    const list = [...(draft?.occasion === occasion ? draft.ideas : []), ...p.copyIdeas(b)].filter((c) => {
      const k = c.headline.toLowerCase();
      if (!c.headline.trim() || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setIdeas(list);
    setPick(0);
    setCopy(list[0] ?? { headline: b.title, tagline: '', extra: b.dates });
    setStep('words');
    window.scrollTo({ top: 0 });
  };

  const create = async () => {
    if (!occasion) return;
    setBusy('create');
    try {
      const keepDraft = draft?.occasion === occasion;
      const res = await http<{ project: { id: string } }>('/api/projects', {
        body: {
          occasion,
          basics: filled(),
          copy,
          copyIdeas: ideas,
          context: keepDraft ? draft.context : undefined,
          facts: keepDraft ? draft.facts : undefined,
        },
      });
      router.push(`/p/${res.project.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(null);
    }
  };

  const steps: Step[] = ['occasion', 'basics', 'words'];
  const back = () => setStep(steps[Math.max(0, steps.indexOf(step) - 1)]);

  return (
    <main className={`mx-auto max-w-xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-12 lg:pt-8 ${step === 'occasion' ? 'lg:max-w-5xl lg:px-8' : ''}`}>
      <header className="mb-4 flex items-center gap-2">
        {step === 'occasion' ? (
          <Link href="/" aria-label="Home" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink/5">
            <Icon name="chevronLeft" />
          </Link>
        ) : (
          <button onClick={back} aria-label="Back a step" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink/5">
            <Icon name="chevronLeft" />
          </button>
        )}
        <span className="font-display text-[19px] font-semibold">Start something new</span>
        <span className="ml-auto flex gap-1.5" aria-label={`Step ${steps.indexOf(step) + 1} of 3`}>
          {steps.map((s) => (
            <span key={s} className={`h-2 w-6 rounded-full ${steps.indexOf(s) <= steps.indexOf(step) ? 'bg-lagoon' : 'bg-line'}`} />
          ))}
        </span>
      </header>

      {step === 'occasion' ? (
        <div className="animate-pop">
          <PageTitle kicker="Step 1" title="What are we celebrating?" sub="Pick one. It decides the artwork, the starter words and the backs." />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
            {OCCASION_PRESETS.map((o) => (
              <button
                key={o.id}
                onClick={() => choose(o.id)}
                className="overflow-hidden rounded-3xl bg-white text-left shadow-[var(--shadow-card)] transition active:scale-[0.98]"
              >
                <div className="bg-sand-2/70 px-5 pt-3">
                  <ShirtPreview design={o.sample} copy={o.copyIdeas(o.example)[0]} style={prefs.style} color={prefs.color} label={o.short} />
                </div>
                <div className="flex items-start gap-2 px-3.5 pb-3.5 pt-2.5">
                  <Icon name={o.icon} size={18} className="mt-0.5 shrink-0 text-lagoon" />
                  <span>
                    <span className="block font-medium leading-tight">{o.short}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.blurb}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          {ai ? (
            <div className="mt-6 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Icon name="sparkles" size={18} className="text-lagoon" /> Or just describe it
              </div>
              <textarea
                value={describe}
                onChange={(e) => setDescribe(e.target.value)}
                rows={2}
                placeholder="e.g. Mom’s 70th in Napa next June, the whole family’s coming"
                aria-label="Describe it"
                className="mb-3 w-full resize-none rounded-2xl bg-sand px-4 py-3 text-[16px] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
              />
              <Button className="w-full" variant="secondary" icon="wand" busy={busy === 'draft'} disabled={describe.trim().length < 4} onClick={fillIn}>
                Fill it in for me
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'basics' && p ? (
        <div className="animate-pop">
          <PageTitle kicker={`Step 2 · ${p.short}`} title="The basics" sub="Only the name is needed. Everything else makes the starter words and backs better." />
          <div className="space-y-4">
            <Field label={p.labels.title}>
              <input
                ref={titleField}
                className={`${input} ${nameMissing && !basics.title.trim() ? 'ring-2 ring-coral' : ''}`}
                value={basics.title}
                onChange={(e) => setBasics({ ...basics, title: e.target.value })}
                placeholder={eg(p.labels.titlePlaceholder)}
                aria-label={p.labels.title}
                aria-invalid={nameMissing && !basics.title.trim()}
                autoFocus
              />
            </Field>
            {!basics.title.trim() && (nameMissing || suggestion) ? (
              <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
                {nameMissing ? <span className="font-medium text-coral">Give it a name to keep going.</span> : null}
                {suggestion ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBasics({ ...basics, title: suggestion });
                      setNameMissing(false);
                    }}
                    className="rounded-full bg-lagoon-soft px-3 py-1 font-medium text-lagoon-deep"
                  >
                    Use “{suggestion}”
                  </button>
                ) : null}
              </div>
            ) : null}
            <Field label={p.labels.people} hint="Commas between names">
              <input className={input} value={people} onChange={(e) => setPeople(e.target.value)} placeholder={eg(p.labels.peoplePlaceholder)} aria-label={p.labels.people} />
            </Field>
            <Field label="When?">
              <input className={input} value={basics.dates} onChange={(e) => setBasics({ ...basics, dates: e.target.value })} placeholder={eg(p.labels.datesPlaceholder)} aria-label="When?" />
            </Field>
            {p.labels.number || p.labels.year ? (
              <div className="flex gap-3">
                {p.labels.number ? (
                  <Field label={p.labels.number}>
                    <input className={input} inputMode="numeric" value={basics.number} maxLength={4} onChange={(e) => setBasics({ ...basics, number: e.target.value })} aria-label={p.labels.number} />
                  </Field>
                ) : null}
                {p.labels.year ? (
                  <Field label={p.labels.year}>
                    <input className={input} inputMode="numeric" value={basics.year} maxLength={12} onChange={(e) => setBasics({ ...basics, year: e.target.value })} aria-label={p.labels.year} />
                  </Field>
                ) : null}
              </div>
            ) : null}
            {p.labels.place ? (
              <Field label={p.labels.place}>
                <input className={input} value={basics.place} onChange={(e) => setBasics({ ...basics, place: e.target.value })} placeholder={eg(p.labels.placePlaceholder)} aria-label={p.labels.place} />
              </Field>
            ) : null}
            {draft?.occasion === occasion && draft.facts.stops?.length ? (
              <p className="rounded-2xl bg-lagoon-soft px-4 py-3 text-sm text-lagoon-deep">
                Got the route too ({draft.facts.stops.map((s) => s.code || s.place).join(' → ')}). It goes on the back; you can edit it later.
              </p>
            ) : null}
          </div>
          <BottomBar>
            <Button size="lg" className="w-full" icon="type" onClick={toWords}>
              Next: the words
            </Button>
          </BottomBar>
        </div>
      ) : null}

      {step === 'words' && p ? (
        <WordsStep p={p} ideas={ideas} pick={pick} copy={copy} prefs={prefs} onPick={(i) => { setPick(i); setCopy(ideas[i]); }} onEdit={(c) => { setCopy(c); setIdeas(ideas.map((x, j) => (j === pick ? c : x))); }}>
          <BottomBar>
            <Button size="lg" className="w-full" variant="coral" icon="sparkles" busy={busy === 'create'} disabled={!copy.headline.trim()} onClick={create}>
              Make it
            </Button>
          </BottomBar>
        </WordsStep>
      ) : null}
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function WordsStep({
  p,
  ideas,
  pick,
  copy,
  prefs,
  onPick,
  onEdit,
  children,
}: {
  p: ReturnType<typeof preset>;
  ideas: Copy[];
  pick: number;
  copy: Copy;
  prefs: { style: 'tee' | 'longsleeve' | 'hoodie'; color: string };
  onPick: (i: number) => void;
  onEdit: (c: Copy) => void;
  children: React.ReactNode;
}) {
  const field = (key: keyof Copy, label: string) => (
    <Field label={label}>
      <input className={input} value={copy[key]} onChange={(e) => onEdit({ ...copy, [key]: e.target.value })} aria-label={label} />
    </Field>
  );
  const big = p.sample;
  return (
    <div className="animate-pop">
      <PageTitle kicker="Step 3" title="Pick the words" sub="Tap one, then change anything. You can always change them later." />
      <div className="mb-4 overflow-hidden rounded-[28px] bg-gradient-to-b from-lagoon-soft to-sand-2 px-10 pt-5 shadow-[var(--shadow-lift)]">
        <ShirtPreview design={big} copy={copy} style={prefs.style} color={prefs.color} label="Preview" />
      </div>
      <div className="-mx-4 mb-5 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]" role="radiogroup" aria-label="Word ideas">
        {ideas.map((c, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={i === pick}
            aria-label={`${c.headline} / ${c.tagline}`}
            onClick={() => onPick(i)}
            className={`w-32 shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ${i === pick ? 'ring-[3px] ring-lagoon' : ''}`}
          >
            <div className="bg-sand-2/60 px-2 pt-2">
              <ShirtPreview design={big} copy={c} style={prefs.style} color={prefs.color} />
            </div>
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {field('headline', 'Big words')}
        {field('tagline', 'Small words')}
        {field('extra', 'Tiny line (optional)')}
        <p className="text-[13px] text-muted">Put a word in &quot;quotes&quot; to make it pop.</p>
      </div>
      {children}
    </div>
  );
}
