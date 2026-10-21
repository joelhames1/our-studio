'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { http } from '@/lib/client/http';
import { Button } from './ui';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={done ? 'check' : 'copy'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt('Copy this:', text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

/** Copies someone's full sign-in link, fetched only on tap so it never sits in the page. */
export function CopyLinkButton({ who, label }: { who: 'erin' | 'joel'; label: string }) {
  const [done, setDone] = useState<'copied' | 'failed' | null>(null);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={done === 'copied' ? 'check' : 'copy'}
      onClick={async () => {
        const link = http<{ link: string }>('/api/admin/link', { body: { who } }).then((r) => r.link);
        try {
          // Safari only allows copying during the tap, so hand it the pending text.
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then((t) => new Blob([t], { type: 'text/plain' })) })]);
          } else {
            await navigator.clipboard.writeText(await link);
          }
          setDone('copied');
        } catch {
          const text = await link.catch(() => null);
          if (text) window.prompt('Copy this:', text);
          setDone(text ? 'copied' : 'failed');
        }
        setTimeout(() => setDone(null), 1800);
      }}
    >
      {done === 'copied' ? 'Copied' : done === 'failed' ? 'Couldn’t copy' : label}
    </Button>
  );
}

export function TestButton({ target, label = 'Test it' }: { target: 'claude' | 'art' | 'storage' | 'alert' | 'backup'; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();
  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        icon="send"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await http<{ ok: boolean; message: string }>('/api/admin/test', { body: { target } });
            setResult(r);
            // A call that works clears any "not working" warning on the page.
            if (r.ok) router.refresh();
          } catch (e) {
            setResult({ ok: false, message: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
      {result ? <p className={`mt-2 text-sm ${result.ok ? 'text-lagoon-deep' : 'text-coral'}`}>{result.message}</p> : null}
    </div>
  );
}

export interface HouseholdBudget {
  id: string;
  name: string;
  spent: number;
  limit: number | null;
  custom: boolean;
  standard: number | null;
}

const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Each household's AI spending this month, and its limit, which Joel can change. */
export function HouseholdBudgets({ households, editable }: { households: HouseholdBudget[]; editable: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  // What was just saved, until the page catches up: another server can take a few seconds to see it.
  const [saved, setSaved] = useState<Record<string, Pick<HouseholdBudget, 'limit' | 'custom'>>>({});
  return (
    <ul className="divide-y divide-line/70 rounded-2xl bg-sand px-3 text-sm">
      {households.map((given) => {
        const h = { ...given, ...saved[given.id] };
        return editing === h.id ? (
          <BudgetForm
            key={h.id}
            household={h}
            onSaved={(budgetUsd) => setSaved((s) => ({ ...s, [h.id]: { limit: budgetUsd ?? h.standard, custom: budgetUsd !== undefined } }))}
            onDone={() => setEditing(null)}
          />
        ) : (
          <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 truncate font-medium text-ink">{h.name}</span>
            <span className="flex items-baseline gap-3">
              <span className="tabular-nums">
                ${h.spent.toFixed(2)}
                <span className="text-muted">{h.limit === null ? ' (no limit of its own)' : ` of ${dollars(h.limit)}`}</span>
              </span>
              {editable ? (
                <button type="button" onClick={() => setEditing(h.id)} className="text-muted underline underline-offset-4" aria-label={`Change ${h.name}’s budget`}>
                  Change
                </button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BudgetForm({ household: h, onSaved, onDone }: { household: HouseholdBudget; onSaved: (budgetUsd: number | undefined) => void; onDone: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(h.limit === null ? '' : String(h.limit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (usd: number | null) => {
    setBusy(true);
    setError('');
    try {
      const { household } = await http<{ household: { budgetUsd?: number } }>('/api/admin/budget', { body: { household: h.id, usd } });
      onSaved(household.budgetUsd);
      onDone();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const id = `budget-${h.id}`;
  return (
    <li className="py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value);
          if (value.trim() === '' || !Number.isFinite(n)) return setError('A number of dollars, like 10.');
          void save(n);
        }}
      >
        <label htmlFor={id} className="mb-2 block font-medium text-ink">
          {h.name}: monthly AI budget
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-10 items-center rounded-2xl bg-white pl-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-lagoon">
            <span className="text-muted">$</span>
            <input
              id={id}
              inputMode="decimal"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              className="h-full w-20 bg-transparent px-1.5 text-[16px] tabular-nums outline-none"
            />
          </span>
          <Button size="sm" type="submit" busy={busy}>
            Save
          </Button>
          {h.custom ? (
            <Button size="sm" type="button" variant="secondary" onClick={() => save(null)} disabled={busy}>
              {h.standard === null ? 'No limit of its own' : `Back to ${dollars(h.standard)}`}
            </Button>
          ) : null}
          <Button size="sm" type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-coral">
            {error}
          </p>
        ) : null}
      </form>
    </li>
  );
}
