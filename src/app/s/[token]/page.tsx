import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GARMENT_STYLES, printPreset, printSizeIn } from '@/lib/design/garments';
import { garmentColor } from '@/lib/design/palettes';
import { fmtIn } from '@/lib/server/export/package';
import { names } from '@/lib/server/people';
import { openShare } from '@/lib/server/printers';

// What a printer sees when they open the link: no sign-in, just this order.
export const metadata: Metadata = { title: 'Print order', referrer: 'no-referrer' };

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default async function SharedOrder({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openShare(token);
  if (!opened) notFound();
  const { decision, project, share } = opened;
  const snap = decision.snapshot;
  const files = decision.files ?? [];
  const href = (i: number, download = false) => `/s/${token}/f/${i}${download ? '?download' : ''}`;
  const picture = files.findIndex((f) => f.name === (snap.back ? 'shirt-preview-both-sides.png' : 'shirt-preview.png'));
  const color = garmentColor(snap.color);
  const size = printSizeIn(printPreset(snap.preset));
  const total = snap.sizes.reduce((a, s) => a + s.qty, 0);
  const from = (await names()).get(decision.approvedBy) ?? 'the customer';
  const rows: [string, string][] = [
    ['Shirts', `${total} × ${GARMENT_STYLES.find((g) => g.id === snap.garment)?.name ?? 'T-shirt'}, ${color.name.toLowerCase()}`],
    ['Front print', `${fmtIn(size.w)} × ${fmtIn(size.h)} in`],
    ...(snap.back ? ([['Back print', `${fmtIn(snap.back.widthIn)} in wide${snap.back.names.length > 1 ? `, a different name on each shirt (${snap.back.names.length})` : ''}`]] as [string, string][]) : []),
    ['Sizes', snap.sizes.map((s) => `${s.qty} × ${s.size}${s.who ? ` (${s.who})` : ''}`).join(', ')],
    ...(snap.notes ? ([['Notes', snap.notes]] as [string, string][]) : []),
  ];

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">Print order</p>
      <h1 className="mt-1 font-display text-[32px] leading-tight font-semibold">{project.title}</h1>
      <p className="mt-1 text-muted">
        From {from} · approved {fmtDate(decision.approvedAt)}
      </p>

      {picture >= 0 ? (
        <div className="mt-6 overflow-hidden rounded-[28px] bg-sand-2 shadow-[var(--shadow-card)]">
          <img src={href(picture)} alt="The shirt" className="w-full" />
        </div>
      ) : null}

      <dl className="mt-6 divide-y divide-line/70 rounded-3xl bg-white px-5 shadow-[var(--shadow-card)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-3 text-[15px]">
            <dt className="w-28 shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 flex-1">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-3 mt-8 font-display text-xl font-semibold">Files</h2>
      <p className="mb-3 text-[15px] text-muted">The order sheet has placement, ink colors and the exact wording. The zip has everything.</p>
      <div className="space-y-2">
        {files.map((f, i) => (
          <a
            key={f.key}
            href={href(i, true)}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${i === 0 ? 'bg-lagoon text-white' : 'bg-white ring-1 ring-line'}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{f.label}</span>
              <span className={`block truncate text-xs ${i === 0 ? 'text-white/75' : 'text-muted'}`}>
                {f.name.split('/').pop()} · {fmtBytes(f.bytes)}
              </span>
            </span>
            <span aria-hidden="true">↓</span>
          </a>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted">This link works until {fmtDate(share.expiresAt)}.</p>
    </main>
  );
}
