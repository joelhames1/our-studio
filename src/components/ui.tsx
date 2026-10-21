'use client';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'coral';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lagoon text-white hover:bg-lagoon-deep shadow-[0_6px_16px_-6px_rgb(14_124_134/0.6)]',
  coral: 'bg-coral text-white hover:brightness-95 shadow-[0_6px_16px_-6px_rgb(238_106_85/0.6)]',
  secondary: 'bg-white text-ink ring-1 ring-line hover:ring-ink/20',
  ghost: 'text-ink/80 hover:bg-ink/5',
};

/**
 * A two-column grid of buttons. On phones each one puts its icon above its
 * label, so labels like "Change something" stay on one line on any phone.
 * A button spanning both columns keeps its icon beside the label.
 */
export const BUTTON_PAIRS =
  'grid grid-cols-2 gap-2 max-sm:[&>*]:h-auto max-sm:[&>*]:min-h-14 max-sm:[&>*]:flex-col max-sm:[&>*]:gap-1 max-sm:[&>*]:rounded-2xl max-sm:[&>*]:px-2 max-sm:[&>*]:py-2.5 max-sm:[&>*]:text-sm max-sm:[&>*]:whitespace-nowrap max-sm:[&>.col-span-2]:min-h-12 max-sm:[&>.col-span-2]:flex-row max-sm:[&>.col-span-2]:gap-2';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none';

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  busy,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: string; busy?: boolean }) {
  const sz = size === 'lg' ? 'h-14 px-7 text-[17px]' : size === 'sm' ? 'h-9 px-3.5 text-sm' : 'h-11 px-5 text-[15px]';
  return (
    <button className={`${base} ${VARIANTS[variant]} ${sz} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
}: {
  href: string;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  const sz = size === 'lg' ? 'h-14 px-7 text-[17px]' : size === 'sm' ? 'h-9 px-3.5 text-sm' : 'h-11 px-5 text-[15px]';
  return (
    <Link href={href} className={`${base} ${VARIANTS[variant]} ${sz} ${className}`}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </Link>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white shadow-[var(--shadow-card)] ${className}`}>{children}</div>;
}

export function Pill({ children, tone = 'lagoon' }: { children: ReactNode; tone?: 'lagoon' | 'coral' | 'sun' | 'muted' }) {
  const tones = {
    lagoon: 'bg-lagoon-soft text-lagoon-deep',
    coral: 'bg-coral-soft text-coral',
    sun: 'bg-sun-soft text-[#8a6410]',
    muted: 'bg-sand-2 text-muted',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function PageTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      {kicker ? <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-lagoon">{kicker}</div> : null}
      <h1 className="font-display text-[28px] leading-tight font-semibold sm:text-[34px]">{title}</h1>
      {sub ? <p className="mt-1.5 text-[15px] text-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * A screen's main action, at the foot of the page. It sits in the page's flow
 * and sticks to the bottom of the screen while you scroll, so it can never end
 * up covering the last thing on the page. (A `fixed` bar can: the screens'
 * pop-in animation makes `fixed` measure from the page instead of the screen.)
 * On a laptop, where the pages are short enough, it's an ordinary toolbar.
 */
export function BottomBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`safe-bottom sticky bottom-0 z-20 -mx-4 mt-8 bg-sand px-4 pt-3 sm:-mx-6 sm:px-6 before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-sand before:to-transparent lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:before:hidden ${className}`}
    >
      {children}
    </div>
  );
}
