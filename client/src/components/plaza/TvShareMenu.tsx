// Ligar a TV da mesa: transmitir a tela direto da Praça, com um menu simples no estilo da mini TV (StreamPip).
// Usa as mesmas preferências da transmissão normal; aqui só o essencial (o que mostrar, qualidade e som).
import { AppWindow, Monitor, Power, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { desktop, type DesktopSource } from '../../lib/desktop';
import { SHARE_PRESETS, useVoice } from '../../store/voice';
import { Spinner, cx } from '../ui';

const QUALITIES = SHARE_PRESETS.filter((p) => p.id === '720p' || p.id === '1080p' || p.id === 'source');

export function TvShareMenu({ onClose }: { onClose: () => void }) {
  const settings = useVoice((s) => s.shareSettings);
  const sharing = useVoice((s) => s.sharing);
  const [presetId, setPresetId] = useState(QUALITIES.some((q) => q.id === settings.presetId) ? settings.presetId : '1080p');
  const [audio, setAudio] = useState(settings.audio);
  const [sources, setSources] = useState<DesktopSource[] | null>(null);
  const [kind, setKind] = useState<'screen' | 'window'>('screen');
  const [source, setSource] = useState<DesktopSource | null>(null);

  // no app desktop, a pessoa escolhe a tela ou janela aqui mesmo; no navegador, o próprio navegador pergunta
  useEffect(() => {
    if (!desktop || sharing) return;
    void desktop.getSources().then((list) => {
      setSources(list);
      setSource(list.find((s) => s.kind === 'screen') ?? list[0] ?? null);
    });
  }, [sharing]);

  const start = () => {
    void useVoice.getState().startShare({ ...settings, presetId, audio }, source?.id);
    onClose();
  };
  const stop = () => {
    void useVoice.getState().stopShare();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[66] grid place-items-center bg-black/40 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="TV da mesa" className="animate-pop-in relative w-[min(94vw,420px)]">
        {/* antena */}
        <div className="pointer-events-none absolute -top-7 left-1/2 h-8 w-16 -translate-x-1/2">
          <span className="absolute bottom-0 left-1/2 h-8 w-[3px] origin-bottom -rotate-[28deg] rounded bg-[#4b4470]" />
          <span className="absolute bottom-0 left-1/2 h-8 w-[3px] origin-bottom rotate-[28deg] rounded bg-[#4b4470]" />
          <span className="absolute bottom-0 left-1/2 h-2 w-5 -translate-x-1/2 rounded-t-full bg-[#2b2350]" />
        </div>
        <div className="rounded-[22px] border-4 border-[#1b1430] bg-[#3d3166] p-2 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.12)]">
          <div className="flex items-center gap-2 px-1.5 pb-1.5">
            <span className={cx('h-2 w-2 rounded-full', sharing ? 'bg-[#ff4d5e] shadow-[0_0_6px_#ff4d5e]' : 'bg-white/30')} />
            <span className="plaza-pixel flex-1 text-[13px] font-bold">{sharing ? 'Sua tela está na TV' : 'Ligar a TV da mesa'}</span>
            <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 hover:bg-white/10">
              <X size={15} />
            </button>
          </div>

          {/* a "tela" da TV */}
          <div className="rounded-[14px] border-2 border-[#1b1430] bg-[#141127] p-3">
            {sharing ? (
              <p className="py-6 text-center text-sm text-white/70">Quem está na mesa já vê a sua tela na TV.</p>
            ) : desktop ? (
              <>
                <div className="mb-2 flex gap-1">
                  {(
                    [
                      ['screen', <Monitor size={13} key="m" />, 'Telas'],
                      ['window', <AppWindow size={13} key="a" />, 'Janelas'],
                    ] as const
                  ).map(([id, icon, label]) => (
                    <button
                      key={id}
                      onClick={() => setKind(id)}
                      className={cx('flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold', kind === id ? 'bg-white/15' : 'text-white/60 hover:text-white')}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
                {!sources ? (
                  <div className="grid h-28 place-items-center">
                    <Spinner />
                  </div>
                ) : (
                  <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
                    {sources
                      .filter((s) => s.kind === kind)
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSource(s)}
                          className={cx('overflow-hidden rounded-lg border-2 text-left', source?.id === s.id ? 'border-[#e8685a]' : 'border-transparent hover:border-white/20')}
                        >
                          {s.thumbnail ? <img src={s.thumbnail} alt="" className="aspect-video w-full bg-black object-cover" /> : <div className="aspect-video w-full bg-black" />}
                          <div className="truncate px-1.5 py-1 text-[11px]">{s.name}</div>
                        </button>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <p className="py-5 text-center text-sm text-white/70">Ao ligar, o navegador pergunta qual tela ou janela mostrar.</p>
            )}
          </div>

          {/* botões da TV */}
          <div className="flex flex-wrap items-center gap-1.5 px-1.5 pt-2">
            {!sharing && (
              <>
                {QUALITIES.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setPresetId(q.id)}
                    className={cx('rounded-lg px-2 py-1 text-xs font-bold', presetId === q.id ? 'bg-white/20' : 'text-white/60 hover:bg-white/10')}
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  onClick={() => setAudio(!audio)}
                  aria-pressed={audio}
                  title={audio ? 'Com o som da tela' : 'Sem o som da tela'}
                  className={cx('flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold', audio ? 'bg-white/20' : 'text-white/60 hover:bg-white/10')}
                >
                  {audio ? <Volume2 size={13} /> : <VolumeX size={13} />} Som
                </button>
              </>
            )}
            <span className="flex-1" />
            {sharing ? (
              <button onClick={stop} className="flex items-center gap-1.5 rounded-xl bg-[#e8685a] px-3 py-1.5 text-sm font-bold hover:brightness-110">
                <Power size={14} /> Desligar a TV
              </button>
            ) : (
              <button onClick={start} disabled={!!desktop && !source} className="flex items-center gap-1.5 rounded-xl bg-[#e8685a] px-3 py-1.5 text-sm font-bold hover:brightness-110 disabled:opacity-50">
                <Power size={14} /> Ligar a TV
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
