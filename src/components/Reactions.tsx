'use client';
import type { ReactionValue } from '@/lib/engine/types';
import { Icon } from './Icon';

const HINTS: Record<ReactionValue, string> = { pass: '← or P', maybe: '↓ or M', love: '→ or L' };

/** What each reaction is called, everywhere it appears. */
export const REACTION_LABELS: Record<ReactionValue, string> = { pass: 'Pass', maybe: 'Maybe', love: 'Love' };

/**
 * The three big buttons, each named underneath so nobody has to guess what an
 * icon means. Thumb-sized on purpose (the small ones, for grids on a laptop,
 * keep just their icons and tooltips).
 */
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
  const labelled = size !== 'sm';
  const btn = (v: ReactionValue, icon: string, on: string, off: string) => {
    const label = REACTION_LABELS[v];
    const button = (
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
    if (!labelled) return button;
    return (
      <div className="flex flex-col items-center gap-1">
        {button}
        <span className={`text-xs font-medium ${value === v ? 'text-ink' : 'text-muted'}`} aria-hidden="true">
          {label}
        </span>
      </div>
    );
  };
  return (
    <div className={`flex items-start justify-center ${size === 'sm' ? 'gap-2' : 'gap-6'}`}>
      {btn('pass', 'x', 'bg-ink text-white', 'bg-white text-ink/70')}
      {btn('maybe', 'bookmark', 'bg-sun text-ink', 'bg-white text-[#b48a1c]')}
      {btn('love', 'heart', 'bg-coral text-white', 'bg-white text-coral')}
    </div>
  );
}
