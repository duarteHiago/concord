// Mini TV da Praça: a transmissão de alguém da mesa numa janelinha flutuante por cima do mapa (como um
// picture-in-picture). Dá para arrastar, redimensionar, pôr em tela cheia e mexer no volume, e continuar andando.
import { Maximize, Maximize2, Volume2, VolumeX, X } from 'lucide-react';
import { Track, type LocalTrack, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { useVoice } from '../../store/voice';
import { Spinner } from '../ui';

const MIN_W = 240;

export function StreamPip({ userId, name, onClose, onOpenCall }: { userId: string; name: string; onClose: () => void; onOpenCall: () => void }) {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick); // redesenha quando a faixa chega
  const volume = useVoice((s) => s.streamVolumes[userId] ?? 1);
  const setVolume = useVoice((s) => s.setVolume);
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState(() => {
    const w = Math.min(420, window.innerWidth - 32);
    return { x: window.innerWidth - w - 16, y: 76, w };
  });

  // assistir = assinar a tela de quem transmite (o app só recebe as telas que a pessoa assiste)
  useEffect(() => {
    useVoice.getState().setWatching(userId, true);
    return () => {
      useVoice.getState().setWatching(userId, false);
    };
  }, [userId]);

  const participant = room ? (room.localParticipant.identity === userId ? room.localParticipant : room.remoteParticipants.get(userId)) : undefined;
  const track = participant?.getTrackPublication(Track.Source.ScreenShare)?.track as LocalTrack | RemoteTrack | undefined;

  const drag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, ...rect };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (mode === 'move') {
        setRect((r) => ({ ...r, x: Math.max(0, Math.min(window.innerWidth - 80, start.x + dx)), y: Math.max(0, Math.min(window.innerHeight - 60, start.y + dy)) }));
      } else {
        setRect((r) => ({ ...r, w: Math.max(MIN_W, Math.min(window.innerWidth - r.x - 8, start.w + dx)) }));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const muted = volume === 0;
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`Transmissão de ${name}`}
      className="animate-pop-in absolute z-[65] select-none"
      style={{ left: rect.x, top: rect.y, width: rect.w }}
    >
      {/* antena */}
      <div className="pointer-events-none absolute -top-7 left-1/2 h-8 w-16 -translate-x-1/2">
        <span className="absolute bottom-0 left-1/2 h-8 w-[3px] origin-bottom -rotate-[28deg] rounded bg-[#4b4470]" />
        <span className="absolute bottom-0 left-1/2 h-8 w-[3px] origin-bottom rotate-[28deg] rounded bg-[#4b4470]" />
        <span className="absolute bottom-0 left-1/2 h-2 w-5 -translate-x-1/2 rounded-t-full bg-[#2b2350]" />
      </div>
      <div className="rounded-[22px] border-4 border-[#1b1430] bg-[#3d3166] p-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.12)]">
        {/* barra de cima: arrastar */}
        <div onPointerDown={(e) => drag(e, 'move')} className="flex cursor-grab items-center gap-2 px-1.5 pb-1.5 text-white active:cursor-grabbing">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#ff4d5e] shadow-[0_0_6px_#ff4d5e]" />
          <span className="plaza-pixel min-w-0 flex-1 truncate text-[13px] font-bold">{name} ao vivo</span>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onOpenCall} title="Abrir na call" aria-label="Abrir na call" className="rounded-lg p-1 hover:bg-white/10">
            <Maximize2 size={14} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void boxRef.current?.querySelector('video')?.requestFullscreen()}
            title="Tela cheia"
            aria-label="Tela cheia"
            className="rounded-lg p-1 hover:bg-white/10"
          >
            <Maximize size={14} />
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="Fechar" aria-label="Fechar a mini TV" className="rounded-lg p-1 hover:bg-white/10">
            <X size={15} />
          </button>
        </div>
        {/* tela */}
        <div className="relative aspect-video overflow-hidden rounded-[14px] border-2 border-[#1b1430] bg-black">
          {track ? <PipVideo track={track} /> : <div className="grid h-full place-items-center"><Spinner /></div>}
          {/* reflexo de vidro */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_40%)]" />
        </div>
        {/* botões da TV */}
        <div className="flex items-center gap-2 px-1.5 pt-2 text-white">
          <button onClick={() => setVolume(userId, muted ? 1 : 0, true)} aria-label={muted ? 'Ativar o som' : 'Mutar'} className="rounded-lg p-1 hover:bg-white/10">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input type="range" min={0} max={2} step={0.05} value={volume} onChange={(e) => setVolume(userId, Number(e.target.value), true)} aria-label="Volume da transmissão" className="w-24" />
          <span className="flex-1" />
          <span className="h-3.5 w-3.5 rounded-full border-2 border-[#1b1430] bg-[#e8685a]" />
          <span className="h-3.5 w-3.5 rounded-full border-2 border-[#1b1430] bg-[#f5c451]" />
          {/* canto para redimensionar */}
          <span onPointerDown={(e) => drag(e, 'resize')} title="Arraste para redimensionar" className="ml-1 h-4 w-4 cursor-nwse-resize rounded-sm bg-[linear-gradient(135deg,transparent_50%,rgba(255,255,255,0.45)_50%)]" />
        </div>
      </div>
    </div>
  );
}

function PipVideo({ track }: { track: LocalTrack | RemoteTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className="h-full w-full object-contain" />;
}
