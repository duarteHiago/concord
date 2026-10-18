import { AppWindow, Gamepad2, Info, Monitor, MonitorUp, RefreshCw, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VideoCodec } from 'livekit-client';
import { desktop, desktopInfo, type DesktopSource } from '../../lib/desktop';
import { useApp } from '../../store/app';
import { estimateBitrate, FPS_OPTIONS, SHARE_PRESETS, screenShareSupport, useVoice, type ShareSettings } from '../../store/voice';
import { Button, Modal, Spinner, Toggle, cx } from '../ui';

const CODECS: { id: VideoCodec; label: string; hint: string }[] = [
  { id: 'h264', label: 'H.264', hint: 'Usa aceleração de hardware (GPU). Menor uso de CPU — recomendado para taxas altas (120 fps ou mais).' },
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
  const [source, setSource] = useState<DesktopSource | null>(null);
  const update = (patch: Partial<ShareSettings>) => setSettings({ ...settings, ...patch });
  const preset = SHARE_PRESETS.find((p) => p.id === settings.presetId) ?? SHARE_PRESETS[1];
  const unsupported = screenShareSupport();
  const canStart = !unsupported && (!desktop || !!source);

  return (
    <Modal
      title="Transmitir tela"
      subtitle={
        desktop
          ? 'Escolha a tela ou janela e a qualidade da transmissão.'
          : 'Escolha a qualidade. Em seguida o navegador vai perguntar o que você quer compartilhar: tela inteira, uma janela ou uma aba.'
      }
      onClose={close}
      width={desktop ? 760 : 600}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            disabled={!canStart}
            onClick={() => {
              close();
              void startShare(settings, source?.id);
            }}
          >
            <MonitorUp size={18} /> {desktop ? (sharing ? 'Trocar transmissão' : 'Transmitir') : sharing ? 'Trocar transmissão' : 'Escolher tela ou janela'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {unsupported && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-300">{unsupported}</p>}

        {desktop && <SourcePicker selected={source} onSelect={setSource} />}

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Resolução</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SHARE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => update({ presetId: p.id })}
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
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Taxa de quadros</h3>
          <div className="grid grid-cols-3 gap-2">
            {FPS_OPTIONS.map((fps) => (
              <button
                key={fps}
                onClick={() => update({ fps, mode: fps <= 30 ? 'detail' : settings.mode })}
                className={cx(
                  'rounded-xl border py-2.5 text-center text-sm font-bold transition-all',
                  settings.fps === fps ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10' : 'border-line bg-surface-0 hover:border-line-strong',
                )}
              >
                {fps}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Upload estimado: até <b className="text-fg-muted">{(estimateBitrate(preset, settings.fps) / 1_000_000).toFixed(1)} Mbps</b>. Cada
            espectador recebe o vídeo pelo servidor, então o seu upload não aumenta com mais pessoas assistindo.
            {settings.fps > 60 &&
              ' Acima de 60 fps, a taxa final depende do seu monitor, GPU e do jogo/app transmitido — o Concord só envia o que conseguir capturar. Em 120 fps não há uma camada de reserva para quem assiste com conexão fraca, pra sobrar CPU pra manter a sua transmissão estável.'}
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Otimizar para</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['motion', <Gamepad2 size={20} />, 'Fluidez', 'Jogos e vídeos: prioriza manter a taxa de quadros'],
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

        <AudioOption settings={settings} update={update} source={source} />

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

function AudioOption({
  settings,
  update,
  source,
}: {
  settings: ShareSettings;
  update: (patch: Partial<ShareSettings>) => void;
  source: DesktopSource | null;
}) {
  const [processAudio, setProcessAudio] = useState<boolean | null>(desktop ? null : false);
  useEffect(() => {
    if (desktop) void desktopInfo().then((i) => setProcessAudio(i.processAudio));
  }, []);

  let title = 'Transmitir áudio';
  let hint = 'Som da aba ou do sistema (marque “Compartilhar áudio” na janela do navegador). Pelo navegador, as vozes da sala podem voltar para quem assiste — use o app desktop para evitar.';
  if (desktop && processAudio) {
    if (source?.kind === 'window') {
      title = 'Transmitir o áudio deste programa';
      hint = `Só o som de “${source.name}”. Vozes da sala e outros programas ficam de fora.`;
    } else {
      title = 'Transmitir o áudio do PC';
      hint = 'Todo o som do computador, menos as vozes da sala — quem assiste não ouve a própria voz de volta.';
    }
  } else if (desktop && processAudio === false) {
    hint = 'A captura de áudio sem retorno precisa do Windows 11 (ou Windows 10 build 20348+). Neste sistema a transmissão vai sem áudio.';
  }
  const disabled = !!desktop && processAudio === false;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-0 p-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-fg-muted">{hint}</div>
      </div>
      <Toggle checked={settings.audio && !disabled} onChange={(audio) => update({ audio })} disabled={disabled} />
    </div>
  );
}

function SourcePicker({ selected, onSelect }: { selected: DesktopSource | null; onSelect: (s: DesktopSource) => void }) {
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [kind, setKind] = useState<'screen' | 'window'>('screen');

  const load = () => {
    setSources(null);
    void desktop!.getSources().then((list) => {
      setSources(list);
      if (!selected) {
        const first = list.find((s) => s.kind === 'screen');
        if (first) onSelect(first);
      }
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const visible = sources?.filter((s) => s.kind === kind) ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            ['screen', <Monitor size={15} />, 'Telas'],
            ['window', <AppWindow size={15} />, 'Janelas'],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setKind(id)}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
              kind === id ? 'bg-surface-4 text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {icon} {label}
          </button>
        ))}
        <button onClick={load} title="Atualizar lista" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-white/5 hover:text-fg">
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {!sources && (
          <div className="col-span-full flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {sources && visible.length === 0 && <p className="col-span-full py-6 text-center text-sm text-fg-muted">Nada encontrado.</p>}
        {visible.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className={cx(
              'overflow-hidden rounded-xl border-2 bg-surface-0 text-left transition-all',
              selected?.id === s.id ? 'border-accent shadow-lg shadow-accent/15' : 'border-transparent hover:border-line-strong',
            )}
          >
            <div className="flex aspect-video items-center justify-center bg-black">
              {s.thumbnail ? <img src={s.thumbnail} alt="" className="h-full w-full object-contain" /> : <AppWindow className="text-fg-subtle" />}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              {s.icon && <img src={s.icon} alt="" className="h-4 w-4 shrink-0" />}
              <span className="truncate text-xs font-medium">{s.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
