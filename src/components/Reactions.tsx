'use client';
import type { ReactionValue } from '@/lib/engine/types';
import { Icon } from './Icon';

const HINTS: Record<ReactionValue, string> = { pass: '← or P', maybe: '↓ or M', love: '→ or L' };

/** The three big buttons. Thumb-sized on purpose (the small ones are for grids on a laptop). */
export function ReactionButtons({
  value,
  onReact,
  size = 'lg',
  keyHints = false,
}: {
  value?: ReactionValue;
  onReact: (v: ReactionValue) => void;
  size?: 'lg' | 'md' | 'sm';
  /** Name the keyboard shortcut in each button's tooltip. */
  keyHints?: boolean;
}) {
  const dim = size === 'lg' ? 'h-16 w-16' : size === 'md' ? 'h-12 w-12' : 'h-10 w-10';
  const btn = (v: ReactionValue, icon: string, label: string, on: string, off: string) => (
    <button
      onClick={() => onReact(v)}
      aria-label={label}
      title={keyHints ? `${label} (${HINTS[v]})` : undefined}
      aria-pressed={value === v}
      className={`flex ${dim} items-center justify-center rounded-full shadow-[var(--shadow-card)] transition active:scale-90 ${value === v ? on : off}`}
    >
      <Icon name={icon} size={size === 'lg' ? 28 : size === 'md' ? 22 : 18} filled={v === 'love' && value === v} />
    </button>
  );
  return (
    <div className={`flex items-center justify-center ${size === 'sm' ? 'gap-2' : 'gap-5'}`}>
      {btn('pass', 'x', 'Not for us', 'bg-ink text-white', 'bg-white text-ink/70')}
      {btn('maybe', 'maybe', 'Maybe', 'bg-sun text-ink', 'bg-white text-[#b48a1c]')}
      {btn('love', 'heart', 'Love it', 'bg-coral text-white', 'bg-white text-coral')}
    </div>
  );
}
