'use client';
import { GarmentPicker } from './GarmentPicker';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { usePrefs } from '@/lib/client/prefs';
import { GARMENT_STYLES } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import { Icon } from './Icon';
import { useState } from 'react';

const VIEWS = [
  { id: 'chest', label: 'Close-up' },
  { id: 'full', label: 'Whole shirt' },
  { id: 'art', label: 'Just the art' },
] as const;

/** Small "Tee · White" button that opens shirt style, color and zoom. */
export function ViewButton() {
  const [prefs, setPrefs] = usePrefs();
  const [open, setOpen] = useState(false);
  const style = GARMENT_STYLES.find((g) => g.id === prefs.style)?.name ?? 'T-shirt';
  const color = garmentColor(prefs.color);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-white pl-1.5 pr-3.5 text-sm font-medium shadow-[var(--shadow-card)] ring-1 ring-line"
      >
        <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: color.hex }} />
        {style} · {color.name}
        <Icon name="shirt" size={15} className="text-ink/50" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Shirt and view">
        <GarmentPicker style={prefs.style} color={prefs.color} onChange={(p) => setPrefs(p)} />
        <div className="mt-4 flex gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Zoom">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={prefs.view === v.id}
              onClick={() => setPrefs({ view: v.id })}
              className={`h-9 flex-1 rounded-full text-sm font-medium transition ${prefs.view === v.id ? 'bg-white shadow-sm' : 'text-ink/60'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button className="mb-2 mt-5 w-full" size="lg" onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    </>
  );
}
