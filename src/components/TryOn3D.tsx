'use client';
import { useEffect, useRef, useState } from 'react';
import { canvasFromMarkup, designCanvas } from '@/lib/client/designTexture';
import { useFonts } from '@/lib/client/fonts';
import { renderBack, type FrontStyle } from '@/lib/design/back/render';
import type { BackDesign, Facts } from '@/lib/design/back/types';
import type { Placement } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import type { Copy, GarmentStyle, ShirtDesign } from '@/lib/design/types';
import type { FitId } from '@/lib/three/body';

/** What the two mannequins are called on screen. (Their ids are older than households.) */
const FIT_NAMES: Record<FitId, string> = { erin: 'Fitted', joel: 'Regular' };
import type { Stage } from '@/lib/three/stage';
import { Icon } from './Icon';
import { ShirtPreview } from './ShirtPreview';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Props {
  design: ShirtDesign;
  copy: Copy;
  style: GarmentStyle;
  color: string;
  widthIn: number;
  placement: Placement;
  fit: FitId;
  onFitChange: (f: FitId) => void;
  /** Draw its own rounded backdrop (off when it sits inside a card already). */
  framed?: boolean;
  /** What's printed on the back, if anything. */
  back?: BackPrint | null;
  /** Turn round to show the back once it's ready. */
  startFacing?: 'front' | 'back';
}

export interface BackPrint {
  design: BackDesign;
  facts: Facts;
  front: FrontStyle;
  widthIn: number;
  wearer?: string;
}

/** The design on a mannequin you can spin all the way round. */
export function TryOn3D({ design, copy, style, color, widthIn, placement, fit, onFitChange, framed = true, back = null, startFacing = 'front' }: Props) {
  const fonts = useFonts();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'nogl'>('loading');
  const [printed, setPrinted] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const [touched, setTouched] = useState(false);
  const turned = useRef(false);
  const shirt = garmentColor(color);

  useEffect(() => {
    if (!hasWebGL()) {
      setStatus('nogl');
      return;
    }
    let live = true;
    let stage: Stage | null = null;
    import('@/lib/three/stage')
      .then(({ createStage }) => {
        if (!live || !canvasRef.current) return;
        stage = createStage(canvasRef.current, {
          onInteract: () => {
            setSpinning(false);
            setTouched(true);
          },
        });
        stageRef.current = stage;
        setStatus('ready');
      })
      .catch((e) => {
        console.error('3D view failed to start', e);
        if (live) setStatus('nogl');
      });
    return () => {
      live = false;
      stage?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status === 'ready') stageRef.current?.setOutfit({ style, colorHex: shirt.hex, tone: shirt.tone, fit });
  }, [status, style, shirt.hex, shirt.tone, fit]);

  useEffect(() => {
    if (status !== 'ready' || !fonts) return;
    let live = true;
    designCanvas(design, copy, { hex: shirt.hex, tone: shirt.tone }, fonts)
      .then((c) => {
        if (!live) return;
        stageRef.current?.setPrint(c, { widthIn, placement });
        return stageRef.current?.frame();
      })
      .then(() => {
        if (!live) return;
        setPrinted(true);
        if (startFacing === 'back' && !turned.current) {
          turned.current = true;
          stageRef.current?.face('back');
          setSpinning(false);
        }
      })
      .catch((e) => console.error('Could not paint the print', e));
    return () => {
      live = false;
    };
  }, [status, fonts, design, copy, shirt.hex, shirt.tone, widthIn, placement, startFacing]);

  // The back print, drawn by the same renderer as the flat preview and the print file.
  const backKey = back ? JSON.stringify([back.design, back.facts, back.front, back.widthIn, back.wearer]) : '';
  useEffect(() => {
    if (status !== 'ready' || !fonts) return;
    const stage = stageRef.current;
    if (!back) {
      stage?.setBackPrint(null, { widthIn: 12, placement: 'center' });
      return;
    }
    let live = true;
    const inner = renderBack(back.design, { fonts, copy, tone: shirt.tone, shirtHex: shirt.hex, assetHref: (k) => `/api/assets/${k}`, facts: back.facts, wearer: back.wearer }, back.front);
    canvasFromMarkup(inner)
      .then((c) => {
        if (live) stageRef.current?.setBackPrint(c, { widthIn: back.widthIn, placement: back.design.size === 'neck' ? 'neck' : 'center' });
      })
      .catch((e) => console.error('Could not paint the back', e));
    return () => {
      live = false;
    };
    // backKey stands in for `back`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fonts, backKey, copy, shirt.hex, shirt.tone]);

  if (status === 'nogl') {
    return (
      <div>
        <ShirtPreview design={design} copy={copy} style={style} color={color} view="full" printWidthIn={widthIn} placement={placement} />
        <p className="mt-2 text-center text-xs text-muted">This browser can&apos;t show 3D, so here&apos;s the flat view.</p>
      </div>
    );
  }

  const btn = (label: string, icon: string, onClick: () => void, on = false) => (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition active:scale-95 ${on ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-line'}`}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  return (
    <div>
      <div
        className={`relative overflow-hidden ${framed ? 'rounded-[28px] bg-[radial-gradient(ellipse_at_50%_35%,#ffffff_0%,#f4ede1_55%,#e9dfcf_100%)] shadow-[var(--shadow-lift)]' : 'rounded-2xl'}`}
        style={{ aspectRatio: '4 / 5' }}
        data-testid="tryon-3d"
        data-state={printed ? 'ready' : 'loading'}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" role="img" aria-label={`3D view: ${copy.headline} on a ${style}`} />
        {!printed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
            <div className="skeleton h-40 w-28 rounded-[40px]" />
            Setting up the fitting room…
          </div>
        ) : null}
        {printed && !touched ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full bg-ink/70 px-3 py-1.5 text-xs font-medium text-white">Drag to spin · pinch to zoom</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {btn(spinning ? 'Spinning' : 'Spin', 'rotate', () => {
          const next = !spinning;
          stageRef.current?.spin(next);
          setSpinning(next);
        }, spinning)}
        {btn('Front view', 'shirt', () => {
          stageRef.current?.face('front');
          setSpinning(false);
        })}
        {btn('Back view', 'undo', () => {
          stageRef.current?.face('back');
          setSpinning(false);
        })}
      </div>
      <div className="mx-auto mt-3 flex max-w-xs gap-1.5 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="Mannequin">
        {(['erin', 'joel'] as const).map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={fit === f}
            onClick={() => onFitChange(f)}
            className={`h-9 flex-1 rounded-full text-sm font-medium transition ${fit === f ? 'bg-white shadow-sm' : 'text-ink/60'}`}
          >
            {FIT_NAMES[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
