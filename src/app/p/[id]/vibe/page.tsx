'use client';
import { useRouter } from 'next/navigation';
import { useProject } from '@/components/ProjectProvider';
import { ShirtPreview } from '@/components/ShirtPreview';
import { Icon } from '@/components/Icon';
import { STYLE_BATCH, useStylePick } from '@/components/StylePicker';
import { BottomBar, Button, PageTitle } from '@/components/ui';
import { usePrefs } from '@/lib/client/prefs';
import { sampleFor } from '@/lib/design/vibes';

/** Styles, with a shirt for each: the full version of the chips at the end of Browse. */
export default function StylePage() {
  const { state } = useProject();
  const [prefs] = usePrefs();
  const router = useRouter();
  const { picked, toggle, changed, apply, busy, styles } = useStylePick();
  const copy = state.project.brief.copy;
  const browse = `/p/${state.project.id}/browse`;

  const go = async () => {
    if (!changed || (await apply())) router.push(browse);
  };

  return (
    <div className="animate-pop">
      <PageTitle title="What style are you after?" sub={`Tap up to three, and ${STYLE_BATCH} new designs will lean that way. Or skip it: everything's a mix to start with.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        {styles.map((v) => {
          const on = picked.includes(v.id);
          return (
            <button
              key={v.id}
              onClick={() => toggle(v.id)}
              aria-pressed={on}
              className={`relative overflow-hidden rounded-3xl bg-white text-left shadow-[var(--shadow-card)] transition active:scale-[0.98] ${
                on ? 'ring-[3px] ring-lagoon' : 'ring-1 ring-transparent'
              }`}
            >
              <div className="bg-sand-2/70 px-4 pt-3">
                <ShirtPreview design={sampleFor(v, state.occasions)} copy={copy} style={prefs.style} color={prefs.color} />
              </div>
              <div className="px-3.5 pb-3.5 pt-2.5">
                <div className="font-medium leading-tight">{v.name}</div>
                <div className="mt-0.5 text-[13px] leading-snug text-muted">{v.blurb}</div>
              </div>
              {on ? (
                <span className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-lagoon text-white shadow">
                  <Icon name="check" size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <BottomBar>
        <div className="lg:mx-auto lg:max-w-md">
          <Button size="lg" className="w-full" onClick={go} busy={busy} icon={changed ? 'sparkles' : 'cards'}>
            {!changed
              ? 'Back to browsing'
              : picked.length
                ? `Make ${STYLE_BATCH} in ${picked.length === 1 ? 'this style' : 'these styles'}`
                : `Make ${STYLE_BATCH} in any style`}
          </Button>
        </div>
      </BottomBar>
    </div>
  );
}
