import { Check, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NOISE_MODES } from '../lib/voiceEffects';
import { useVoice } from '../store/voice';
import { cx } from './ui';

type Kind = 'audioinput' | 'audiooutput' | 'videoinput';

const TITLES: Record<Kind, string> = {
  audioinput: 'Microfone',
  audiooutput: 'Saída de áudio',
  videoinput: 'Câmera',
};

async function listDevices(kind: Kind): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  // sem permissão os nomes vêm vazios: pede acesso uma vez e lista de novo
  if (devices.filter((d) => d.kind === kind).every((d) => !d.label)) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'videoinput' ? { video: true } : { audio: true });
      stream.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      // sem permissão: mostra o que der
    }
  }
  return devices.filter((d) => d.kind === kind && d.deviceId !== 'communications');
}

/** Botão principal + setinha que abre a lista de dispositivos daquele tipo. */
export function DeviceSplitButton({
  kind,
  label,
  danger,
  onClick,
  children,
}: {
  kind: Kind;
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex shrink-0 items-center rounded-full hover:bg-surface-4/60">
      <button
        title={label}
        aria-label={label}
        onClick={onClick}
        className={cx('flex h-9 w-8 items-center justify-center rounded-l-full transition-colors', danger ? 'text-danger' : 'text-fg-muted hover:text-fg')}
      >
        {children}
      </button>
      <button
        title={`Escolher ${TITLES[kind].toLowerCase()}`}
        aria-label={`Escolher ${TITLES[kind].toLowerCase()}`}
        aria-expanded={open}
        onClick={() => {
          setAnchor(ref.current?.getBoundingClientRect() ?? null);
          setOpen(!open);
        }}
        className="flex h-9 w-4 items-center justify-center rounded-r-full text-fg-subtle hover:text-fg"
      >
        <ChevronUp size={13} className={cx('transition-transform', !open && 'rotate-180')} />
      </button>
      {/* fora da barra lateral (que corta o que passa da borda), preso à tela */}
      {open && anchor && createPortal(<DeviceList ref={menuRef} kind={kind} anchor={anchor} onDone={() => setOpen(false)} />, document.body)}
    </div>
  );
}

const MENU_WIDTH = 300;

function DeviceList({ kind, anchor, onDone, ref }: { kind: Kind; anchor: DOMRect; onDone: () => void; ref: React.Ref<HTMLDivElement> }) {
  const settings = useVoice((s) => s.audioSettings);
  const setAudioSettings = useVoice((s) => s.setAudioSettings);
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null);

  useEffect(() => {
    void listDevices(kind).then(setDevices, () => setDevices([]));
  }, [kind]);

  const current = kind === 'audioinput' ? settings.inputId : kind === 'audiooutput' ? settings.outputId : settings.videoInputId;
  const pick = (deviceId: string) => {
    if (kind === 'audioinput') void setAudioSettings({ inputId: deviceId });
    else if (kind === 'audiooutput') void setAudioSettings({ outputId: deviceId });
    else void setAudioSettings({ videoInputId: deviceId });
    onDone();
  };
  const isCurrent = (d: MediaDeviceInfo, i: number) => d.deviceId === current || (!current && i === 0) || (current === 'default' && d.deviceId === 'default');

  // abre acima do botão, alinhado a ele, sem sair da tela
  const left = Math.min(Math.max(8, anchor.left - 12), window.innerWidth - MENU_WIDTH - 8);
  const bottom = window.innerHeight - anchor.top + 8;

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[80] max-h-[70vh] animate-pop-in overflow-y-auto rounded-3xl bg-popover p-2 shadow-2xl ring-1 ring-line-strong"
      style={{ left, bottom, width: MENU_WIDTH }}
    >
      <div className="px-3 pt-1 pb-1.5 text-xs font-bold text-fg-subtle">{TITLES[kind]}</div>
      {!devices && <div className="px-3 py-2 text-sm text-fg-muted">Procurando…</div>}
      {devices?.length === 0 && <div className="px-3 py-2 text-sm text-fg-muted">Nenhum dispositivo encontrado.</div>}
      {devices?.map((d, i) => (
        <button
          key={d.deviceId}
          role="menuitemradio"
          aria-checked={isCurrent(d, i)}
          onClick={() => pick(d.deviceId)}
          className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm hover:bg-surface-4"
        >
          <span className="flex-1 truncate">{d.label || `${TITLES[kind]} ${i + 1}`}</span>
          {isCurrent(d, i) && <Check size={15} className="shrink-0 text-accent" />}
        </button>
      ))}
      {kind === 'audioinput' && (
        <>
          <div className="mx-2 my-1.5 h-px bg-line" />
          <div className="px-3 pt-1 pb-1.5 text-xs font-bold text-fg-subtle">Supressão de ruído</div>
          {NOISE_MODES.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={settings.noiseMode === m.id}
              onClick={() => void setAudioSettings({ noiseMode: m.id })}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-1.5 text-left text-sm hover:bg-surface-4"
            >
              <span className="flex-1 truncate">{m.label}</span>
              {settings.noiseMode === m.id && <Check size={15} className="shrink-0 text-accent" />}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
