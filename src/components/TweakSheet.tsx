'use client';
import { useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { toast } from './Toast';
import { useProject } from './ProjectProvider';
import { http } from '@/lib/client/http';
import { usePrefs } from '@/lib/client/prefs';
import { addArtRequest } from '@/lib/design/examples';
import type { ShirtOption } from '@/lib/server/studio';

/**
 * "What should change?": a plain-English request that makes a new version.
 * In a sheet on the design page; inline beside the card on a laptop's Browse.
 */
export function TweakForm({ option, onDone, inline = false }: { option: ShirtOption; onDone?: (o: ShirtOption) => void; inline?: boolean }) {
  const { state, addVersion } = useProject();
  const [prefs] = usePrefs();
  const [text, setText] = useState('');
  const quick = ['Different colors', 'Bigger words', 'More playful', 'Simpler', addArtRequest(state.occasions), 'Make it a badge', 'Just the words'];
  const words = option.payload.copyOverride ?? state.project.brief.copy;
  const line = (words.tagline.trim() || words.headline.trim()).replace(/"/g, '').slice(0, 24);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const send = async (request: string) => {
    if (!request.trim()) return;
    setBusy(true);
    try {
      const res = await http<{ option: ShirtOption; summary: string }>(`/api/projects/${state.project.id}/tweak`, {
        body: { optionId: option.id, request, shirt: prefs.color },
      });
      const kept = await addVersion(res.option, option.id);
      toast(kept ? `Made a new version: ${res.summary}. It's in Favorites too.` : `Made a new version: ${res.summary}`);
      setText('');
      // Inline, hand the keys back to the page so the arrow shortcuts work again.
      if (inline) field.current?.blur();
      onDone?.(res.option);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className={`mb-3 text-muted ${inline ? 'text-sm' : 'text-[15px]'}`}>Say it however you like. I&apos;ll make a new version and keep this one too.</p>
      <textarea
        ref={field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={inline ? 2 : 3}
        autoFocus={!inline}
        aria-label="What should change?"
        placeholder={`e.g. less cheesy, bolder colors${line ? `, make “${line}” bigger` : ''}`}
        className={`mb-3 w-full resize-none rounded-2xl px-4 py-3 outline-none ring-1 ring-line focus:ring-2 focus:ring-lagoon ${inline ? 'bg-sand text-[15px]' : 'bg-white text-[17px] shadow-[var(--shadow-card)]'}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(text);
          }
          if (e.key === 'Escape' && inline) field.current?.blur();
        }}
      />
      <p className={`mb-2 text-muted ${inline ? 'text-xs' : 'text-sm'}`}>Or tap one to make it straight away:</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={busy}
            className={`rounded-full px-3.5 font-medium ring-1 ring-line active:scale-95 ${inline ? 'bg-sand py-1.5 text-[13px] hover:bg-sand-2' : 'bg-white py-2 text-sm'}`}
          >
            {q}
          </button>
        ))}
      </div>
      <Button size={inline ? 'md' : 'lg'} className={inline ? 'w-full' : 'mb-2 w-full'} onClick={() => send(text)} busy={busy} icon="wand" disabled={!text.trim()}>
        Make it
      </Button>
      {/* Only whoever runs the site can connect Claude, so only they hear about it. */}
      {!state.ai.words && state.me.admin ? (
        <p className={`pb-2 text-center text-xs text-muted ${inline ? 'pt-2' : ''}`}>Without Claude this understands short phrases only. Add ANTHROPIC_API_KEY in Setup.</p>
      ) : null}
    </>
  );
}

export function TweakSheet({ option, open, onClose, onCreated }: { option: ShirtOption; open: boolean; onClose: () => void; onCreated?: (o: ShirtOption) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="What should change?">
      <TweakForm
        option={option}
        onDone={(o) => {
          onClose();
          onCreated?.(o);
        }}
      />
    </Sheet>
  );
}
