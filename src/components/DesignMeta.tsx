'use client';
import { LAYOUTS } from '@/lib/design/layouts';
import { pairing } from '@/lib/design/pairings';
import { palette } from '@/lib/design/palettes';
import { MOTIF_NAMES } from '@/lib/design/motifs';
import type { ShirtOption } from '@/lib/server/studio';
import { Pill } from './ui';
import { Icon } from './Icon';
import { listNames, sharedLine } from '@/lib/engine/together';
import { useProject } from './ProjectProvider';

export function describeDesign(o: ShirtOption): string {
  const d = o.payload;
  const art =
    d.art.kind === 'motif' ? MOTIF_NAMES[d.art.motif] : d.art.kind === 'none' ? 'Just words' : 'AI artwork';
  return [LAYOUTS[d.layout]?.name, pairing(d.pairing).name, palette(d.palette).name, art].filter(Boolean).join(' · ');
}

export function DesignBadges({ option }: { option: ShirtOption }) {
  const { state, otherLoves, myReaction, lovers, members } = useProject();
  const who = lovers(option.id);
  const others = who.filter((m) => m.id !== state.me.id);
  const both = otherLoves(option.id) && myReaction(option.id) === 'love';
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
      {option.source === 'seed' ? <Pill tone="sun">{option.label ?? 'The original'}</Pill> : null}
      {option.source === 'ai' ? (
        <Pill tone="lagoon">
          <Icon name="sparkles" size={12} /> New artwork
        </Pill>
      ) : null}
      {option.source === 'tweak' && option.label ? <Pill tone="muted">“{option.label}”</Pill> : null}
      {option.payload.copyOverride ? <Pill tone="muted">Its own words</Pill> : null}
      {option.payload.colors ? <Pill tone="muted">Its own colors</Pill> : null}
    </div>
  );
}
