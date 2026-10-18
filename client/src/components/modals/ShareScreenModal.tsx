import { Gamepad2, Info, MonitorUp, Type } from 'lucide-react';
import { useState } from 'react';
import type { VideoCodec } from 'livekit-client';
import { useApp } from '../../store/app';
import { SHARE_PRESETS, screenShareSupport, useVoice, type ShareSettings } from '../../store/voice';
import { Button, Modal, Toggle, cx } from '../ui';

const CODECS: { id: VideoCodec; label: string; hint: string }[] = [
  { id: 'h264', label: 'H.264', hint: 'Usa aceleração de hardware (GPU). Menor uso de CPU — recomendado para 60 fps.' },
  { id: 'vp9', label: 'VP9', hint: 'Mais qualidade por bit, usa mais CPU.' },
  { id: 'av1', label: 'AV1', hint: 'Máxima eficiência; requer GPU recente para codificar em tempo real.' },
  { id: 'vp8', label: 'VP8', hint: 'Compatibilidade máxima.' },
];

export function ShareScreenModal() {
  const close = useApp((s) => s.closeModal);
  const current = useVoice((s) => s.shareSettings);
  const sharing = useVoice((s) => s.sharing);
  const startShare = useVoice((s) => s.startShare);
  const [settings, setSettings] = useState<ShareSettings>(current);
  const update = (patch: Partial<ShareSettings>) => setSettings({ ...settings, ...patch });
  const preset = SHARE_PRESETS.find((p) => p.id === settings.presetId) ?? SHARE_PRESETS[1];
  const unsupported = screenShareSupport();

  return (
    <Modal
      title="Transmitir tela"
      subtitle="Escolha a qualidade. Em seguida o navegador vai perguntar o que você quer compartilhar: tela inteira, uma janela ou uma aba."
      onClose={close}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            disabled={!!unsupported}
            onClick={() => {
              close();
              void startShare(settings);
            }}
          >
            <MonitorUp size={18} /> {sharing ? 'Trocar transmissão' : 'Escolher tela ou janela'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {unsupported && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-300">{unsupported}</p>}
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Resolução e taxa de quadros</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SHARE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => update({ presetId: p.id, mode: p.fps === 30 ? 'detail' : settings.mode })}
                className={cx(
                  'rounded-xl border p-3 text-left transition-all',
                  settings.presetId === p.id ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10' : 'border-line bg-surface-0 hover:border-line-strong',
                )}
              >
                <div className="text-sm font-bold">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-fg-muted">{p.hint}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Upload estimado: até <b className="text-fg-muted">{(preset.bitrate / 1_000_000).toFixed(1)} Mbps</b>. Cada espectador recebe o
            vídeo pelo servidor, então o seu upload não aumenta com mais pessoas assistindo.
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Otimizar para</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['motion', <Gamepad2 size={20} />, 'Fluidez', 'Jogos e vídeos: prioriza manter 60 fps'],
                ['detail', <Type size={20} />, 'Nitidez', 'Texto e código: prioriza a resolução'],
              ] as const
            ).map(([id, icon, label, hint]) => (
              <button
                key={id}
                onClick={() => update({ mode: id })}
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                  settings.mode === id ? 'border-accent bg-accent/10' : 'border-line bg-surface-0 hover:border-line-strong',
                )}
              >
                {icon}
                <div>
                  <div className="text-sm font-bold">{label}</div>
                  <div className="text-[11px] text-fg-muted">{hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-0 p-3">
          <div>
            <div className="text-sm font-semibold">Transmitir áudio</div>
            <div className="text-xs text-fg-muted">Som da aba ou do sistema (marque “Compartilhar áudio” na janela do navegador).</div>
          </div>
          <Toggle checked={settings.audio} onChange={(audio) => update({ audio })} />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Codec de vídeo</h3>
          <div className="flex gap-2">
            {CODECS.map((c) => (
              <button
                key={c.id}
                onClick={() => update({ codec: c.id })}
                className={cx(
                  'flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors',
                  settings.codec === c.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-muted hover:text-fg',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle">
            <Info size={13} className="mt-0.5 shrink-0" />
            {CODECS.find((c) => c.id === settings.codec)?.hint}
          </p>
        </div>
      </div>
    </Modal>
  );
}
