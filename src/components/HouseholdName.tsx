'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { http } from '@/lib/client/http';
import { Button } from './ui';

/** The household's name, which its owner can change in place. */
export function HouseholdName({ name, canRename }: { name: string; canRename: boolean }) {
  const router = useRouter();
  // What was just saved, until the page catches up: another server can take a few seconds to see a rename.
  const [shown, setShown] = useState(name);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { household } = await http<{ household: { name: string } }>('/api/household', { body: { name: value } });
      setShown(household.name);
      setValue(household.name);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-display text-[30px] leading-tight font-semibold">{shown}</h1>
        {canRename ? (
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted underline underline-offset-4">
            Rename
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <form onSubmit={save} className="mt-2">
      <label htmlFor="household-name" className="sr-only">
        Household name
      </label>
      <div className="flex gap-2">
        <input
          id="household-name"
          value={value}
          maxLength={60}
          autoFocus
          required
          onChange={(e) => setValue(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-2xl bg-white px-4 text-[16px] shadow-[var(--shadow-card)] ring-1 ring-line outline-none focus:ring-2 focus:ring-lagoon"
        />
        <Button type="submit" busy={busy}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setValue(shown);
            setError('');
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-coral-soft px-4 py-3 text-[15px] text-coral">
          {error}
        </p>
      ) : null}
    </form>
  );
}
