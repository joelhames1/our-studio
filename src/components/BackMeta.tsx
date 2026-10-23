'use client';
import { backTemplate, templateName } from '@/lib/design/back/templates';
import type { Occasion } from '@/lib/design/back/types';
import { pairing } from '@/lib/design/pairings';
import { palette } from '@/lib/design/palettes';
import type { BackOption } from '@/lib/server/studio';
import { Icon } from './Icon';
import { listNames, sharedLine } from '@/lib/engine/together';
import { useProject } from './ProjectProvider';
import { Pill } from './ui';

/** A back's name, as it's called for this project's occasions: "Class of · Round stamp". */
export function backName(o: BackOption, occasions: readonly Occasion[] = []): string {
  const t = backTemplate(o.payload.template);
  const v = t.variants.find((x) => x.id === o.payload.variant) ?? t.variants[0];
  const name = templateName(t, occasions);
  return t.variants.length > 1 ? `${name} · ${v.name}` : name;
}

/** backName for the project on screen. */
export function useBackName(): (o: BackOption) => string {
  const { state } = useProject();
  return (o) => backName(o, state.occasions);
}

export function describeBack(o: BackOption): string {
  const d = o.payload;
  const size = d.size === 'neck' ? 'Small, under the collar' : 'Big back print';
  const style = d.palette || d.pairing ? [d.pairing ? pairing(d.pairing).name : null, d.palette ? palette(d.palette).name : null].filter(Boolean).join(' · ') : 'Matches the front';
  return [size, style].join(' · ');
}

export function BackBadges({ option }: { option: BackOption }) {
  const { state, otherLoves, myReaction, lovers, members } = useProject();
  const who = lovers(option.id);
  const others = who.filter((m) => m.id !== state.me.id);
  const both = otherLoves(option.id) && myReaction(option.id) === 'love';
  const t = backTemplate(option.payload.template);
  return (
    <div className="flex flex-wrap gap-1.5">
      {both ? (
        <Pill tone="coral">
          <Icon name="heart" size={12} filled /> {sharedLine(who.length, members)}
        </Pill>
      ) : others.length ? (
        <Pill tone="coral">
          <Icon name="heart" size={12} filled /> {listNames(others.map((m) => m.name))} {others.length === 1 ? 'loves' : 'love'} this
        </Pill>
      ) : null}
      {t.personal ? <Pill tone="sun">Everyone gets their own name</Pill> : null}
      {option.source === 'tweak' && option.label ? <Pill tone="muted">“{option.label}”</Pill> : null}
    </div>
  );
}
