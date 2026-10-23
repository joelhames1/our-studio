'use client';
import { useEffect, useRef, useState } from 'react';
import { http } from '@/lib/client/http';
import { DAY_MS, fitCheck, FRESH_DAYS, lastSearched, METHOD_NAMES, normalZip, printerMessage, type FitNote, type Printer, type PrinterStatus, type PrintJob } from '@/lib/kinds/printers';
import type { ShareLink } from '@/lib/engine/types';
import { Icon } from './Icon';
import { useProject } from './ProjectProvider';
import { Sheet } from './Sheet';
import { toast } from './Toast';
import { Button } from './ui';

interface FinderState {
  job: PrintJob;
  zip: string;
  printers: Printer[];
  /** False when the server reused recent results instead of searching. */
  searched?: boolean;
}

const SEARCHING = ['Searching the web…', 'Reading their websites…', 'Checking minimums and file requirements…', 'Looking for prices…', 'Nearly done…'];
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * On the final screen: printers near a ZIP code and online, a shared shortlist,
 * and a link to send them. `sendAny` opens the link for a shop you already have
 * (the page's own "Send to a print shop" button); `onSendClosed` hears when it closes.
 */
export function PrinterFinder({ sendAny = false, onSendClosed }: { sendAny?: boolean; onSendClosed?: () => void }) {
  const { state } = useProject();
  const pid = state.project.id;
  const [data, setData] = useState<FinderState | null>(null);
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<Printer | null>(null);
  const sending: Printer | 'any' | null = picked ?? (sendAny ? 'any' : null);
  const setSending = (p: Printer | null) => {
    setPicked(p);
    if (!p) onSendClosed?.();
  };
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    http<FinderState>(`/api/projects/${pid}/printers`)
      .then((d) => {
        setData(d);
        setZip((z) => z || d.zip);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [pid]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, [busy]);

  const search = async (refresh = false) => {
    setBusy(true);
    setTick(0);
    try {
      const next = await http<FinderState>(`/api/projects/${pid}/printers`, { body: { zip, refresh } });
      setData(next);
      setLoadError('');
      if (refresh && !next.searched) toast('That ZIP code was searched a few minutes ago, so this list is current.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const update = async (p: Printer, patch: { status?: PrinterStatus; remove?: true }) => {
    try {
      if (patch.remove) {
        await http(`/api/printers/${p.id}`, { method: 'DELETE' });
        setData((d) => d && { ...d, printers: d.printers.filter((x) => x.id !== p.id) });
      } else {
        const { printer } = await http<{ printer: Printer }>(`/api/printers/${p.id}`, { method: 'PATCH', body: patch });
        setData((d) => d && { ...d, printers: d.printers.map((x) => (x.id === p.id ? printer : x)) });
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const order = (list: Printer[]) => [...list].sort((a, b) => Number(a.kind === 'online') - Number(b.kind === 'online') || a.name.localeCompare(b.name));
  const mine = order(data?.printers.filter((p) => p.status !== 'found') ?? []);
  // Results for whatever ZIP code is typed, as soon as it's typed: searching again costs money.
  const key = normalZip(zip);
  const near = order(data?.printers.filter((p) => p.status === 'found' && p.searches[key]) ?? []);
  const last = data ? lastSearched(data.printers, key) : null;
  const fresh = !!last && Date.now() - Date.parse(last) < FRESH_DAYS * DAY_MS;

  // Without Claude there's no search; only whoever runs the site can do anything about that, so only they hear about it.
  const canSearch = state.ai.words;
  if (!canSearch && !state.me.admin && !mine.length) {
    return data && sending ? <SendSheet printer={sending === 'any' ? null : sending} job={data.job} onClose={() => setSending(null)} /> : null;
  }

  return (
    <section className="mt-6" aria-labelledby="printers">
      <h2 id="printers" className="font-display text-xl font-semibold">
        {canSearch || state.me.admin ? 'Find a printer' : 'Your printers'}
      </h2>
      {canSearch ? (
        <p className="mt-1 text-[15px] text-muted">
          Shops near you and online services that ship to you. Claude reads their websites, so check anything important with them before you order.
        </p>
      ) : null}

      {canSearch ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && key && !fresh) void search();
          }}
        >
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="ZIP code"
            aria-label="ZIP code"
            autoComplete="postal-code"
            maxLength={10}
            className="h-12 w-36 min-w-0 rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon"
          />
          <Button type="submit" className="flex-1" busy={busy} disabled={!key || fresh} icon={fresh ? 'check' : 'search'}>
            {fresh ? 'Up to date' : last ? 'Search again' : 'Find printers'}
          </Button>
        </form>
      ) : state.me.admin ? (
        <p className="mt-4 rounded-2xl bg-sun-soft px-4 py-3 text-sm text-[#6b4f0c]">
          Printer search needs Claude: add ANTHROPIC_API_KEY in Setup. Only you see this; everyone else just doesn&apos;t see the search.
        </p>
      ) : null}

      {last && !busy ? (
        <p className="mt-2 text-sm text-muted">
          {fresh ? `Checked ${day(last)}. ` : `Checked ${day(last)}, over a month ago, so details may have changed.`}
          {fresh && state.ai.words ? (
            <button type="button" onClick={() => void search(true)} className="font-medium text-lagoon">
              Refresh (about 30¢)
            </button>
          ) : null}
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-3 rounded-2xl bg-coral-soft px-4 py-3 text-sm text-coral">The printer list didn&apos;t load: {loadError}</p>
      ) : !data && !busy ? (
        <p className="mt-3 text-sm text-muted">Loading your printer list…</p>
      ) : null}

      {busy ? (
        <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-muted shadow-[var(--shadow-card)]" aria-live="polite">
          {SEARCHING[Math.min(tick, SEARCHING.length - 1)]} This takes a minute or two.
        </div>
      ) : null}

      {data && mine.length ? (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-muted">Your list</h3>
          <div className="space-y-3">
            {mine.map((p) => (
              <PrinterCard key={p.id} p={p} job={data.job} onUpdate={(patch) => update(p, patch)} onSend={() => setSending(p)} />
            ))}
          </div>
        </>
      ) : null}

      {data && near.length ? (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-muted">Found near {key}</h3>
          <div className="space-y-3">
            {near.map((p) => (
              <PrinterCard key={p.id} p={p} job={data.job} onUpdate={(patch) => update(p, patch)} onSend={() => setSending(p)} />
            ))}
          </div>
        </>
      ) : null}

      {data && sending ? <SendSheet printer={sending === 'any' ? null : sending} job={data.job} onClose={() => setSending(null)} /> : null}
    </section>
  );
}

const NOTE_STYLE: Record<FitNote['level'], { icon: string; tone: string }> = {
  ok: { icon: 'check', tone: 'text-lagoon-deep' },
  info: { icon: 'info', tone: 'text-ink/70' },
  warn: { icon: 'alert', tone: 'text-coral' },
};

/** An Email link to exactly that address: anything after it (a "?bcc=" in a page's text, say) is part of the address, not the link. */
const mailto = (email: string) => `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`;

function PrinterCard({ p, job, onUpdate, onSend }: { p: Printer; job: PrintJob; onUpdate: (patch: { status?: PrinterStatus; remove?: true }) => void; onSend: () => void }) {
  const notes = fitCheck(p, job);
  const details: [string, string | null][] = [
    ['Minimum', p.minimum],
    ['Turnaround', p.turnaround],
    ['Prices', p.pricing],
    ['Artwork files', p.fileRequirements],
    ['How to send', p.howToSend],
    ['Also', p.notes],
  ];
  return (
    <article className="rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${p.kind === 'local' ? 'bg-sun-soft text-[#8a6410]' : 'bg-lagoon-soft text-lagoon-deep'}`}>
          <Icon name={p.kind === 'local' ? 'pin' : 'globe'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium leading-tight">{p.name}</h4>
          <p className="text-sm text-muted">
            {p.kind === 'local' ? 'Local shop' : 'Online, ships to you'}
            {p.address || p.area ? ` · ${p.address ?? p.area}` : ''}
          </p>
        </div>
        {p.status !== 'found' ? <span className="shrink-0 rounded-full bg-lagoon-soft px-2 py-1 text-[11px] font-semibold text-lagoon-deep">{p.status === 'used' ? 'Used' : 'Saved'}</span> : null}
      </div>

      {p.methods.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.methods.map((m) => (
            <span key={m} className="rounded-full bg-sand px-2.5 py-1 text-xs">
              {METHOD_NAMES[m]}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {notes.map((n) => (
          <li key={n.text} className={`flex gap-2 text-sm ${NOTE_STYLE[n.level].tone}`}>
            <Icon name={NOTE_STYLE[n.level].icon} size={16} className="mt-0.5 shrink-0" />
            <span>{n.text}</span>
          </li>
        ))}
      </ul>

      {details.some(([, v]) => v) ? (
        <details className="mt-3 rounded-2xl bg-sand/70 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">What their site says</summary>
          <dl className="mt-2 space-y-1.5">
            {details
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        </details>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {p.website ? (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-lagoon">
            <Icon name="globe" size={14} /> Website
          </a>
        ) : null}
        {p.phone ? (
          <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-medium text-lagoon">
            <Icon name="phone" size={14} /> {p.phone}
          </a>
        ) : null}
        {p.email ? (
          <a href={mailto(p.email)} className="inline-flex items-center gap-1 font-medium text-lagoon">
            <Icon name="mail" size={14} /> Email
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted">
        From {p.sources.length ? (
          p.sources.map((s, i) => (
            <span key={s}>
              {i ? ', ' : ''}
              <a href={s} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {new URL(s).hostname.replace(/^www\./, '')}
              </a>
            </span>
          ))
        ) : (
          'a web search'
        )}{' '}
        · checked {day(p.checkedAt)} · not verified
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon="send" onClick={onSend}>
          Send them the files
        </Button>
        <Button size="sm" variant="secondary" icon={p.status === 'found' ? 'star' : 'check'} onClick={() => onUpdate({ status: p.status === 'found' ? 'saved' : p.status === 'saved' ? 'used' : 'found' })}>
          {p.status === 'found' ? 'Save' : p.status === 'saved' ? 'We used them' : 'Unmark'}
        </Button>
        <button onClick={() => onUpdate({ remove: true })} className="h-9 rounded-full px-3 text-sm text-muted hover:bg-ink/5">
          Remove
        </button>
      </div>
    </article>
  );
}

/** Makes a link for the printer and the message to go with it. */
function SendSheet({ printer, job, onClose }: { printer: Printer | null; job: PrintJob; onClose: () => void }) {
  const { state, refresh } = useProject();
  const [link, setLink] = useState<{ url: string; share: ShareLink } | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    http<{ url: string; share: ShareLink }>(`/api/projects/${state.project.id}/share`, { body: { printerId: printer?.id ?? null } })
      .then(setLink)
      .catch((e) => setError((e as Error).message));
  }, [printer, state.project.id]);

  const until = link ? new Date(link.share.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
  const message = link ? printerMessage(job, link.url, until, state.me.name, printer ?? undefined) : null;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  const turnOff = async () => {
    if (!link) return;
    try {
      await http(`/api/projects/${state.project.id}/share`, { method: 'DELETE', body: { hash: link.share.hash } });
      toast('Link turned off');
      refresh().catch(() => undefined);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open onClose={onClose} title={printer ? `Send to ${printer.name}` : 'Send to a printer'}>
      {error ? <p className="rounded-2xl bg-coral-soft px-4 py-3 text-sm text-coral">{error}</p> : null}
      {!link && !error ? <p className="text-muted">Making a link…</p> : null}
      {link && message ? (
        <>
          <p className="text-[15px] text-muted">
            Anyone with this link can see the order and download the print files, without signing in. It works until {until}, and you can turn it off any time.
          </p>
          <div className="mt-3 break-all rounded-2xl bg-white px-4 py-3 font-mono text-[13px] ring-1 ring-line">{link.url}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {printer?.email ? (
              <a
                href={`${mailto(printer.email)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-lagoon px-5 font-medium text-white"
              >
                <Icon name="mail" size={18} /> Email them
              </a>
            ) : (
              <a
                href={`mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-lagoon px-5 font-medium text-white"
              >
                <Icon name="mail" size={18} /> Write an email
              </a>
            )}
            <Button variant="secondary" icon="copy" onClick={() => copy(link.url, 'Link')}>
              Copy link
            </Button>
            <Button variant="secondary" icon="copy" onClick={() => copy(`${message.subject}\n\n${message.body}`, 'Message')}>
              Copy message
            </Button>
          </div>
          {printer && !printer.email ? (
            <p className="mt-3 text-sm text-muted">
              No email on their site{printer.howToSend ? `; they say: ${printer.howToSend}` : ''}. Paste the link into their order form or quote request.
            </p>
          ) : null}
          <details className="mt-4 rounded-2xl bg-white/70 px-4 py-2 text-sm ring-1 ring-line">
            <summary className="cursor-pointer font-medium">The message</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-ink/80">{message.body}</pre>
          </details>
          <button onClick={turnOff} className="mt-4 text-sm text-muted underline underline-offset-4">
            Turn off this link
          </button>
        </>
      ) : null}
    </Sheet>
  );
}
