'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { derivedStats } from '@/lib/design/back/facts';
import type { FactKey, Facts, Stop } from '@/lib/design/back/types';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';
import { Sheet } from './Sheet';
import { toast } from './Toast';
import { Button } from './ui';

const box = 'h-11 min-w-0 rounded-xl bg-white px-3 text-[16px] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon';
const input = `${box} w-full`;
const small = 'h-9 w-9 shrink-0 rounded-full text-ink/60 hover:bg-ink/5 disabled:opacity-30';

const YEAR_LABELS = ['Est.', 'Since', 'Vintage', 'Class of', 'Born'];

function Group({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group mb-3 rounded-3xl bg-white/70 px-4 py-1 ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 font-medium">
        <span>
          {title}
          {hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}
        </span>
        <Icon name="chevronRight" size={18} className="text-ink/40 transition group-open:rotate-90" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

/** The details every back draws from: names, route, numbers, timeline, place. */
export function FactsSheet({ open, onClose, focus = [] }: { open: boolean; onClose: () => void; focus?: FactKey[] }) {
  const { state, saveBrief } = useProject();
  const [f, setF] = useState<Facts>(state.facts);
  const [people, setPeople] = useState(state.facts.people.join(', '));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setF(state.facts);
      setPeople(state.facts.people.join(', '));
    }
  }, [open, state.facts]);

  const set = (patch: Partial<Facts>) => setF((x) => ({ ...x, ...patch }));
  const setStop = (i: number, patch: Partial<Stop>) => set({ stops: f.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = <T,>(list: T[], i: number, d: number): T[] => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    return next;
  };
  const wants = (...keys: FactKey[]) => keys.some((k) => focus.includes(k));
  // Only trips (or projects that already have a route) show the route form.
  const hasRoute = state.occasions.includes('trip') || f.stops.length > 0 || wants('stops');

  const save = async () => {
    setBusy(true);
    try {
      await saveBrief({ facts: { ...f, people: people.split(/[,\n]+/).map((p) => p.trim()).filter(Boolean) } });
      toast('Details saved. Every back is updated.');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const suggestions = derivedStats(f).filter((d) => !f.stats.some((s) => s.label.toLowerCase() === d.label.toLowerCase()));

  return (
    <Sheet open={open} onClose={onClose} title="The details">
      <p className="mb-4 text-[15px] text-muted">Fill these in once and every back uses them. Leave anything blank that doesn&apos;t apply.</p>

      <Group title="Who and what" hint="Names, the name of the thing, the dates" open={!focus.length || wants('people', 'title', 'dates', 'signature')}>
        <Field label="Names (commas between)">
          <input className={input} value={people} onChange={(e) => setPeople(e.target.value)} aria-label="Names" />
        </Field>
        <Field label="What it's called">
          <input className={input} value={f.title} onChange={(e) => set({ title: e.target.value })} aria-label="What it's called" placeholder={`e.g. ${state.project.title}`} />
        </Field>
        <Field label="Dates">
          <input className={input} value={f.dates} onChange={(e) => set({ dates: e.target.value })} aria-label="Dates" />
        </Field>
        <Field label="Sign-off line">
          <input className={input} value={f.signature} onChange={(e) => set({ signature: e.target.value })} aria-label="Sign-off line" />
        </Field>
      </Group>

      {!hasRoute ? null : (
        <Group title="The route" hint={`${f.stops.length} stop${f.stops.length === 1 ? '' : 's'}, in order`} open={wants('stops')}>
          {f.stops.map((s, i) => (
            <div key={i} className={`py-2 ${i ? 'border-t border-line/70' : ''}`}>
              <div className="flex gap-2">
                <input className={`${box} w-[4.5rem] flex-none uppercase`} value={s.code} maxLength={4} onChange={(e) => setStop(i, { code: e.target.value.toUpperCase() })} aria-label="Airport code" placeholder="Code" />
                <input className={`${box} flex-1`} value={s.place} onChange={(e) => setStop(i, { place: e.target.value })} aria-label="Place" placeholder="City" />
                <input className={`${box} w-24 flex-none`} value={s.region} onChange={(e) => setStop(i, { region: e.target.value })} aria-label="State or country" placeholder="State" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input className={`${box} w-24 flex-none`} value={s.date} onChange={(e) => setStop(i, { date: e.target.value })} aria-label="Date" placeholder="Date" />
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[#0e7c86]" checked={s.stay} onChange={(e) => setStop(i, { stay: e.target.checked })} />
                  Stayed here
                </label>
                <button className={small} disabled={i === 0} onClick={() => set({ stops: move(f.stops, i, -1) })} aria-label="Move up">
                  ↑
                </button>
                <button className={small} disabled={i === f.stops.length - 1} onClick={() => set({ stops: move(f.stops, i, 1) })} aria-label="Move down">
                  ↓
                </button>
                <button className={small} onClick={() => set({ stops: f.stops.filter((_, j) => j !== i) })} aria-label="Remove stop">
                  <Icon name="x" size={16} className="mx-auto" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => set({ stops: [...f.stops, { code: '', place: '', region: '', date: '', stay: true }] })}
            className="mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-lagoon"
            disabled={f.stops.length >= 14}
          >
            <Icon name="plane" size={16} /> Add a stop
          </button>
          <p className="text-xs text-muted">Untick &ldquo;Stayed here&rdquo; for plane changes; the tour-dates back skips those.</p>
        </Group>
      )}

      <Group title="The numbers" hint="Years, miles, candles: anything worth counting" open={wants('stats')}>
        {f.stats.map((s, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input className={`${box} w-24 flex-none`} value={s.value} onChange={(e) => set({ stats: f.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} aria-label="Number" />
            <input className={`${box} flex-1`} value={s.label} onChange={(e) => set({ stats: f.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Of what" />
            <button className={small} onClick={() => set({ stats: f.stats.filter((_, j) => j !== i) })} aria-label="Remove number">
              <Icon name="x" size={16} className="mx-auto" />
            </button>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          {f.stats.length < 8 ? (
            <button onClick={() => set({ stats: [...f.stats, { value: '', label: '' }] })} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-line">
              + Add a number
            </button>
          ) : null}
          {suggestions.map((d) => (
            <button key={d.label} onClick={() => set({ stats: [...f.stats, d] })} className="rounded-full bg-lagoon-soft px-3 py-1.5 text-sm font-medium text-lagoon-deep">
              + {d.value} {d.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="The timeline" hint="The years that got you here" open={wants('timeline')}>
        {f.timeline.map((m, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input className={`${box} w-24 flex-none`} value={m.year} onChange={(e) => set({ timeline: f.timeline.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)) })} aria-label="Year" />
            <input className={`${box} flex-1`} value={m.label} onChange={(e) => set({ timeline: f.timeline.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="What happened" />
            <button className={small} onClick={() => set({ timeline: f.timeline.filter((_, j) => j !== i) })} aria-label="Remove year">
              <Icon name="x" size={16} className="mx-auto" />
            </button>
          </div>
        ))}
        {f.timeline.length < 6 ? (
          <button onClick={() => set({ timeline: [...f.timeline, { year: '', label: '' }] })} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-line">
            + Add a year
          </button>
        ) : null}
      </Group>

      <Group title="Year and number" hint="For “Est.” and “Class of” backs, and jerseys" open={wants('year', 'yearLabel', 'bigNumber')}>
        <div className="flex gap-2">
          <Field label="Word">
            <select className={`${box} w-32`} value={f.yearLabel} onChange={(e) => set({ yearLabel: e.target.value })} aria-label="Year word">
              {[...new Set([f.yearLabel, ...YEAR_LABELS])].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <input className={input} value={f.year} onChange={(e) => set({ year: e.target.value })} aria-label="Year" inputMode="numeric" />
          </Field>
        </div>
        <Field label="Jersey number">
          <input className={`${box} w-28`} value={f.bigNumber} maxLength={4} onChange={(e) => set({ bigNumber: e.target.value })} aria-label="Jersey number" />
        </Field>
      </Group>

      <Group title="The big line" hint="One sentence, said loudly" open={wants('statement')}>
        <input className={input} value={f.statement} onChange={(e) => set({ statement: e.target.value })} aria-label="The big line" />
      </Group>

      <Group title="The place" hint="For the coordinates back" open={wants('place')}>
        <Field label="Name">
          <input className={input} value={f.place.name} onChange={(e) => set({ place: { ...f.place, name: e.target.value } })} aria-label="Place name" />
        </Field>
        <div className="flex gap-2">
          <Field label="Latitude">
            <input className={input} inputMode="decimal" value={f.place.lat ?? ''} onChange={(e) => set({ place: { ...f.place, lat: e.target.value === '' ? null : (e.target.value as unknown as number) } })} aria-label="Latitude" />
          </Field>
          <Field label="Longitude">
            <input className={input} inputMode="decimal" value={f.place.lng ?? ''} onChange={(e) => set({ place: { ...f.place, lng: e.target.value === '' ? null : (e.target.value as unknown as number) } })} aria-label="Longitude" />
          </Field>
        </div>
        {f.place.unchecked ? (
          <div className="flex items-center gap-3 rounded-2xl bg-sun-soft px-3 py-2 text-sm text-[#6b4f0c]">
            <span className="flex-1">These were looked up for you. Worth a quick check on a map before printing.</span>
            <button onClick={() => set({ place: { ...f.place, unchecked: undefined } })} className="shrink-0 rounded-full bg-white px-3 py-1.5 font-medium">
              Looks right
            </button>
          </div>
        ) : null}
      </Group>

      {/* Not a trip, but there's a journey in it (a reunion road trip, say): a route can still go on the back. */}
      {!hasRoute ? (
        <button
          onClick={() => set({ stops: [{ code: '', place: '', region: '', date: '', stay: true }] })}
          className="mb-3 flex w-full items-center gap-2 rounded-3xl border-2 border-dashed border-line px-4 py-3 text-left text-sm text-muted"
        >
          <Icon name="plane" size={16} className="text-lagoon" /> Is there a journey in it? Add the stops and the back can show the route
        </button>
      ) : null}

      <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-sand via-sand to-transparent px-5 pb-2 pt-4">
        <Button size="lg" className="w-full" busy={busy} onClick={save} icon="check">
          Save the details
        </Button>
      </div>
    </Sheet>
  );
}
