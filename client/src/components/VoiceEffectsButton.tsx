import { Check, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EFFECTS } from '../lib/voiceEffects';
import { useVoice } from '../store/voice';
import { cx } from './ui';

/** Botão de efeitos de voz na barra de controles da sala. */
export function VoiceEffectsButton() {
  const effect = useVoice((s) => s.effect);
  const setEffect = useVoice((s) => s.setEffect);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = effect !== 'none';

  return (
    <div ref={ref} className="relative">
      <button
        title={active ? `Efeito de voz: ${EFFECTS.find((e) => e.id === effect)?.label}` : 'Efeitos de voz'}
        aria-label="Efeitos de voz"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
          active ? 'bg-accent text-on-accent' : open ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg hover:bg-surface-4',
        )}
      >
        <Wand2 size={20} />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-1/2 z-30 mb-3 w-64 -translate-x-1/2 animate-pop-in rounded-[24px] bg-surface-2 p-2 shadow-2xl ring-1 ring-line">
          <div className="px-3 pt-2 pb-1 text-sm font-bold">Efeitos de voz</div>
          <p className="px-3 pb-2 text-xs text-fg-muted">Todo mundo na sala ouve sua voz com o efeito.</p>
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              role="menuitemradio"
              aria-checked={effect === e.id}
              onClick={() => void setEffect(e.id)}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-3', effect === e.id && 'bg-surface-3')}
            >
              <span className="flex-1">
                <span className="block text-sm font-semibold">{e.label}</span>
                <span className="block text-xs text-fg-muted">{e.hint}</span>
              </span>
              {effect === e.id && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
