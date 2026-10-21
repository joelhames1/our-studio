'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nameIn, useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { BackPreview } from '@/components/BackPreview';
import { PrinterFinder } from '@/components/PrinterFinder';
import { Icon } from '@/components/Icon';
import { Button, LinkButton, PageTitle, Spinner } from '@/components/ui';
import { toast } from '@/components/Toast';
import { http } from '@/lib/client/http';
import { GARMENT_STYLES, printPreset, printSizeIn } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import type { Decision } from '@/lib/engine/types';
import type { ShirtSnapshot } from '@/lib/kinds/shirt';
import type { ProjectState } from '@/lib/server/studio';

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function DonePage() {
  const { state, setState, refresh } = useProject();
  const router = useRouter();
  const [decision, setDecision] = useState<Decision<ShirtSnapshot> | null>(state.decision);
  const [reopening, setReopening] = useState(false);
  const started = useRef(false);
  const base = `/p/${state.project.id}`;

  // Track mounting separately from the build effect: React may re-run effects
  // (dev Strict Mode), and the in-flight build must still land when it finishes.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!decision || decision.status !== 'building' || started.current) return;
    started.current = true;
    (async () => {
      try {
        let d = (await http<{ decision: Decision<ShirtSnapshot> }>(`/api/decisions/${decision.id}/build`, { body: {} })).decision;
        // Someone else's build is running: poll until it finishes.
        while (mounted.current && d.status === 'building') {
          await new Promise((r) => setTimeout(r, 3000));
          d = (await http<ProjectState>(`/api/projects/${state.project.id}`)).decision ?? d;
        }
        if (mounted.current) {
          setDecision(d);
          refresh().catch(() => undefined);
        }
      } catch (e) {
        toast((e as Error).message, 'error');
        started.current = false;
      }
    })();
  }, [decision, state.project.id, refresh]);

  if (!decision) {
    return (
      <div className="animate-pop pt-6 text-center">
        <PageTitle title="Nothing approved yet" />
        <LinkButton href={`${base}/favorites`} icon="star">
          See favorites
        </LinkButton>
      </div>
    );
  }

  const snap = decision.snapshot;
  const color = garmentColor(snap.color);
  const preset = printPreset(snap.preset);
  const dims = printSizeIn(preset);
  const style = GARMENT_STYLES.find((g) => g.id === snap.garment)?.name ?? 'Shirt';
  const total = snap.sizes.reduce((a, s) => a + s.qty, 0);

  const rebuild = async () => {
    started.current = false;
    setDecision({ ...decision, status: 'building', error: undefined });
  };

  const changeMind = async () => {
    if (!confirm('Go back to choosing? The current print files will be set aside.')) return;
    setReopening(true);
    try {
      setState(await http<ProjectState>(`/api/projects/${state.project.id}/reopen`, { body: {} }));
      router.push(`${base}/favorites`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setReopening(false);
    }
  };

  return (
    <div className="animate-pop">
      {decision.status === 'ready' ? <Confetti /> : null}
      <PageTitle
        kicker={decision.approvedBy === state.me.id ? 'You picked it' : `${nameIn(state, decision.approvedBy)} picked it`}
        title="It's the one!"
        sub={`${style} in ${color.name.toLowerCase()} · ${total} shirt${total === 1 ? '' : 's'} · ${dims.w} × ${dims.h} in print`}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        <div className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-b from-lagoon-soft to-sand-2 px-4 pt-4 shadow-[var(--shadow-lift)] lg:sticky lg:top-32 lg:mb-0">
          {snap.back ? (
            <div className="grid grid-cols-2 gap-2 pb-2">
              <ShirtPreview design={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" printWidthIn={preset.widthIn} placement={preset.placement} label="Front" />
              <BackPreview back={snap.back.design} facts={snap.back.facts} front={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" wearer={snap.back.names[0]} label="Back" />
            </div>
          ) : (
            <ShirtPreview design={snap.design} copy={snap.copy} style={snap.garment} color={snap.color} view="full" printWidthIn={preset.widthIn} placement={preset.placement} />
          )}
        </div>

        <div>
          {decision.status === 'building' ? (
            <div className="flex items-center gap-3 rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
              <Spinner className="text-lagoon" />
              <div>
                <div className="font-medium">Making the print files…</div>
                <div className="text-sm text-muted">Full resolution at 300 DPI. This takes up to a minute.</div>
              </div>
            </div>
          ) : decision.status === 'failed' ? (
            <div className="rounded-3xl bg-coral-soft p-5">
              <div className="font-medium text-coral">The print files didn&apos;t build</div>
              <p className="mt-1 text-sm text-ink/70">{decision.error}</p>
              <Button className="mt-3" variant="coral" onClick={rebuild} icon="rotate">
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-card)]">
                <h2 className="font-display text-xl font-semibold">For the print shop</h2>
                <p className="mt-1 text-[15px] text-muted">
                  Send them the <b className="font-medium text-ink">print file{snap.back ? 's (front and back)' : ''}</b> and the <b className="font-medium text-ink">order sheet</b>. Or just send the zip, which has everything.
                </p>
                <div className="mt-4 space-y-2">
                  {(decision.files ?? []).map((f, i) => (
                    <a
                      key={f.key}
                      href={`/api/assets/${f.key}?download=${encodeURIComponent(f.name.split('/').pop()!)}`}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.99] ${i === 0 ? 'bg-lagoon text-white' : 'bg-sand ring-1 ring-line'}`}
                    >
                      <Icon name={f.name.endsWith('.zip') ? 'download' : f.name.endsWith('.pdf') ? 'file' : 'shirt'} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{f.label}</span>
                        <span className={`block truncate text-xs ${i === 0 ? 'text-white/75' : 'text-muted'}`}>
                          {f.name} · {fmtBytes(f.bytes)}
                        </span>
                      </span>
                      <Icon name="download" size={18} />
                    </a>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-3xl bg-sun-soft p-5 text-[15px] text-[#6b4f0c]">
                <div className="mb-1 font-medium">Tip</div>
                Order one test shirt first. Colors on fabric always look a little different from a screen, and it&apos;s cheap insurance before the full order.
              </div>
              <PrinterFinder />
            </>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        {state.canApprove ? (
          <button onClick={changeMind} disabled={reopening} className="text-sm text-muted underline underline-offset-4">
            {reopening ? 'Reopening…' : 'Changed your mind? Go back to choosing'}
          </button>
        ) : (
          <p className="text-sm text-muted">Want a different one? {state.approverName} can reopen it.</p>
        )}
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ['#ee6a55', '#f6c453', '#0e7c86', '#3cc8c8', '#ffad5a'];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="absolute block h-3 w-2 rounded-sm"
          style={{
            left: `${(i * 97) % 100}%`,
            bottom: '-20px',
            background: colors[i % colors.length],
            animation: `float-up ${2.2 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}
