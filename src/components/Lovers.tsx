'use client';
import { listNames } from '@/lib/engine/together';
import { useProject } from './ProjectProvider';

const MAX = 5;

/**
 * Who loves a design, as a row of initials. Only in households of more than
 * two: with two, "Both" and "Erin ♥" already say who.
 */
export function Lovers({ optionId, className = '' }: { optionId: string; className?: string }) {
  const { lovers, members } = useProject();
  const who = lovers(optionId);
  if (members <= 2 || !who.length) return null;
  return (
    <span className={`flex items-center -space-x-1.5 ${className}`} role="img" aria-label={`Loved by ${listNames(who.map((m) => m.name))}`}>
      {who.slice(0, MAX).map((m) => (
        <span key={m.id} title={m.name} className="flex h-6 w-6 items-center justify-center rounded-full bg-coral text-[11px] font-semibold text-white ring-2 ring-white">
          {m.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {who.length > MAX ? (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-coral-soft px-1 text-[11px] font-semibold text-coral ring-2 ring-white">+{who.length - MAX}</span>
      ) : null}
    </span>
  );
}
