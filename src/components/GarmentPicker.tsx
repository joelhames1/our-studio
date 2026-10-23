'use client';
import { GARMENT_STYLES } from '@/lib/design/garments';
import { GARMENT_COLORS } from '@/lib/design/palettes';
import type { GarmentStyle } from '@/lib/design/types';

export function GarmentPicker({
  style,
  color,
  onChange,
  compact,
}: {
  style: GarmentStyle;
  color: string;
  onChange: (p: { style?: GarmentStyle; color?: string }) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      <div className="flex gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Shirt style">
        {GARMENT_STYLES.map((g) => (
          <button
            key={g.id}
            role="radio"
            aria-checked={style === g.id}
            onClick={() => onChange({ style: g.id })}
            className={`h-9 flex-1 rounded-full text-sm font-medium transition ${style === g.id ? 'bg-white text-ink shadow-sm' : 'text-ink/60'}`}
          >
            {g.name}
          </button>
        ))}
      </div>
      {/* Wrapped rather than scrolled sideways, so every color is in sight. */}
      <div className="flex flex-wrap gap-2.5 p-1" role="radiogroup" aria-label="Shirt color">
        {GARMENT_COLORS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={color === c.id}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange({ color: c.id })}
            className={`h-9 w-9 shrink-0 rounded-full ring-1 ring-black/10 transition ${color === c.id ? 'scale-110 outline outline-[3px] outline-offset-2 outline-lagoon' : ''}`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
    </div>
  );
}
