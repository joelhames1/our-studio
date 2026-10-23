import { Icon } from './Icon';

/** The four steps, as a new household first hears them. */
export const HOW_STEPS = [
  {
    icon: 'plus',
    title: 'Start a project',
    text: 'Pick the occasion and add the names, dates and places. A first batch of designs is ready straight away.',
  },
  {
    icon: 'heart',
    title: 'Everyone votes',
    text: 'Swipe through the designs: love the ones you like, maybe or pass the rest. Passes stay private, and the ones more of you love rise to the top.',
  },
  {
    icon: 'wand',
    title: 'Make it yours',
    text: 'Open a design and tap Change it to say what you want (“navy shirt, bigger words”), or ask for new artwork. Spin it in 3D before anything’s made.',
  },
  {
    icon: 'check',
    title: 'Approve and print',
    text: 'Whoever has the final say approves it and picks the sizes. You get print-ready files and a list of printers near you.',
  },
] as const;

/** How Our Studio works, in four steps. `compact` for the card a newcomer sees above existing projects. */
export function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={compact ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2'}>
      {HOW_STEPS.map((s, i) => (
        <li key={s.title} className={compact ? 'flex gap-3' : 'flex gap-3 rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]'}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lagoon-soft text-lagoon-deep" aria-hidden>
            <Icon name={s.icon} size={18} />
          </span>
          <span>
            <span className="block font-medium">
              <span className="text-muted">{i + 1}.</span> {s.title}
            </span>
            <span className="mt-0.5 block text-[14px] leading-snug text-muted">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The one line on money, for the end of the tour. */
export const HOW_MONEY = 'Fresh ideas, remixes and hand edits are free. New artwork and Claude’s ideas come out of your household’s monthly AI budget.';
