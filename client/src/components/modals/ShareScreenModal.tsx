import { AppWindow, Gamepad2, Info, Monitor, MonitorUp, RefreshCw, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VideoCodec } from 'livekit-client';
import { desktop, desktopInfo, type DesktopSource } from '../../lib/desktop';
import { h265Support } from '../../lib/h265';
import { useApp } from '../../store/app';
import { estimateBitrate, FPS_OPTIONS, SHARE_PRESETS, screenShareSupport, useVoice, type ShareSettings } from '../../store/voice';
import { Button, Modal, Spinner, Toggle, cx } from '../ui';

const CODECS: { id: VideoCodec | 'auto'; label: string; hint: string }[] = [
  {
    id: 'auto',
    label: 'Automático',
    hint: 'H.264 pela placa de vídeo (NVIDIA, AMD ou Intel), sem pesar no processador. Recomendado.',
  },
  { id: 'h264', label: 'H.264', hint: 'Normalmente codificado pela placa de vídeo. Compatível com tudo.' },
  {
    id: 'h265',
    label: 'H.265',
    hint: 'Também pela placa de vídeo, com imagem mais nítida que o H.264 no mesmo upload. Nem todo computador consegue assistir: veja a opção abaixo.',
  },
  { id: 'vp9', label: 'VP9', hint: 'Codificado pelo processador: mais qualidade por bit, mas pesa bastante.' },
  { id: 'av1', label: 'AV1', hint: 'Codificado pelo processador aqui (o navegador ainda não usa a placa para AV1): pesa muito.' },
  { id: 'vp8', label: 'VP8', hint: 'Sempre codificado pelo processador: em 1080p60 pesa bastante no PC.' },
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
  // no Chromium o H.265 só existe pela placa de vídeo: se o navegador anuncia, a placa codifica
  const [canH265] = useState(() => h265Support().encode);

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
          <div className="grid grid-cols-2 gap-2">
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
          <div className="flex flex-wrap gap-2">
            {CODECS.map((c) => {
              const off = c.id === 'h265' && !canH265;
              return (
                <button
                  key={c.id}
                  disabled={off}
                  title={off ? 'Sua placa de vídeo ou navegador não codifica H.265' : undefined}
                  onClick={() => update({ codec: c.id })}
                  className={cx(
                    'flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    settings.codec === c.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-muted enabled:hover:text-fg',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle">
            <Info size={13} className="mt-0.5 shrink-0" />
            {settings.codec === 'h265' && !canH265
              ? 'Este computador não codifica H.265 pela placa de vídeo, então a transmissão vai sair em H.264.'
              : CODECS.find((c) => c.id === settings.codec)?.hint}
          </p>
          {!canH265 && settings.codec !== 'h265' && (
            <p className="mt-1 text-xs text-fg-subtle">
              H.265 indisponível aqui: precisa de uma placa de vídeo com codificador H.265 e de Chrome, Edge ou o app do Concord atualizados.
            </p>
          )}
          {settings.codec === 'h265' && canH265 && (
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-surface-0 p-3">
              <div>
                <div className="text-sm font-semibold">Voltar para H.264 se alguém não conseguir assistir</div>
                <div className="text-xs text-fg-muted">
                  {settings.allowFallback
                    ? 'Recomendado. Se entrar alguém cujo computador não reproduz H.265, a transmissão passa para H.264 para todos, e ninguém fica sem ver.'
                    : 'Desligado: a transmissão fica sempre em H.265. Quem não consegue reproduzir vê uma explicação de como resolver e pode pedir para você liberar o H.264.'}
                </div>
              </div>
              <Toggle checked={settings.allowFallback} onChange={(allowFallback) => update({ allowFallback })} />
            </div>
          )}
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
      {kind === 'window' && (
        <p className="mb-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Para jogos em modo janela, capturar a janela específica pode travar justo quando ela está em foco (o Windows muda como desenha a
          janela nesse momento). Se notar isso, prefira transmitir a <b>tela</b> inteira.
        </p>
      )}
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
