'use client';
import { useState } from 'react';
import { http } from '@/lib/client/http';
import type { ProjectState } from '@/lib/server/studio';
import { useProject } from './ProjectProvider';
import { toast } from './Toast';
import { Button } from './ui';

/**
 * Who makes the final call, and for whoever may (they do now, they started
 * it, or they own the household), a way to hand it to anyone else in the
 * household before it's approved.
 */
export function FinalSay({ className = '' }: { className?: string }) {
  const { state, setState } = useProject();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(state.project.approver ?? '');
  const [busy, setBusy] = useState(false);
  const current = state.members.find((m) => m.id === (state.project.approver ?? state.project.createdBy));
  if (state.members.length < 2 || state.project.status === 'approved') return null;

  const save = async () => {
    setBusy(true);
    try {
      setState(await http<ProjectState>(`/api/projects/${state.project.id}/approver`, { body: { approver: pick } }));
      setOpen(false);
      const to = state.members.find((m) => m.id === pick);
      toast(pick === state.me.id ? 'You have the final say now.' : `${to?.name ?? 'They'} has the final say now.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  return (
    <div className={`text-sm text-muted ${className}`}>
      {!open ? (
        <p className="text-center">
          Final say: <span className="font-medium text-ink">{state.canApprove ? 'you' : (current?.name ?? state.approverName)}</span>
          {state.canChooseApprover ? (
            <>
              {' · '}
              <button
                onClick={() => {
                  setPick(state.project.approver ?? current?.id ?? '');
                  setOpen(true);
                }}
                className="underline underline-offset-4"
              >
                Change
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <div className="rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 font-medium text-ink">Who makes the final call?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who has the final say">
            {state.members.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={pick === m.id}
                onClick={() => setPick(m.id)}
                className={`h-10 rounded-full px-4 text-[15px] font-medium ${pick === m.id ? 'bg-ink text-white' : 'bg-sand-2 text-ink'}`}
              >
                {m.id === state.me.id ? `${m.name} (you)` : m.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={save} busy={busy} disabled={!pick}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
