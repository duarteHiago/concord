// Mini TV da Praça: a transmissão de alguém da mesa numa janelinha flutuante por cima do mapa (como um
// picture-in-picture). Dá para arrastar, redimensionar, pôr em tela cheia e mexer no volume, e continuar andando.
import { ChevronLeft, ChevronRight, Maximize, Maximize2, Volume2, VolumeX, X } from 'lucide-react';
import { Track, type LocalTrack, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { useVoice } from '../../store/voice';
import { Spinner } from '../ui';

const MIN_W = 240;

export function StreamPip({
  userId,
  name,
  channels,
  onChannel,
  onClose,
  onOpenCall,
}: {
  userId: string;
  name: string;
  /** quem está transmitindo na call (cada um é um canal) */
  channels: string[];
  onChannel: (userId: string) => void;
  onClose: () => void;
  onOpenCall: () => void;
}) {
  const room = useVoice((s) => s.room);
  useVoice((s) => s.tick); // redesenha quando a faixa chega
  const volume = useVoice((s) => s.streamVolumes[userId] ?? 1);
  const setVolume = useVoice((s) => s.setVolume);
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState(() => {
    // celular: quase a largura toda, centralizada e abaixo da barra de cima (e do entalhe do iPhone)
    const narrow = window.innerWidth < 768;
    const w = Math.min(420, window.innerWidth - (narrow ? 24 : 32));
    return narrow ? { x: (window.innerWidth - w) / 2, y: 112, w } : { x: window.innerWidth - w - 16, y: 76, w };
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

  // trocar de canal: chiado de TV antiga por um instante (e enquanto a imagem nova não chega)
  const [noiseUntil, setNoiseUntil] = useState(0);
  const [, setNow] = useState(0);
  const ch = channels.indexOf(userId);
  const zap = (dir: 1 | -1) => {
    if (channels.length < 2) {
      // um canal só: um chiado curto mesmo assim, como a TV de verdade
      setNoiseUntil(Date.now() + 250);
      playStatic(volume, 0.2);
      return;
    }
    const next = channels[(Math.max(0, ch) + dir + channels.length) % channels.length];
    setNoiseUntil(Date.now() + 550);
    playStatic(volume, 0.45);
    onChannel(next);
  };
  // mudou de canal sozinha (a transmissão de antes acabou): chiado também
  const firstChannel = useRef(userId);
  useEffect(() => {
    if (userId === firstChannel.current) return;
    firstChannel.current = userId;
    setNoiseUntil((u) => Math.max(u, Date.now() + 450));
  }, [userId]);
  useEffect(() => {
    if (!noiseUntil) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, noiseUntil - Date.now()) + 10);
    return () => clearTimeout(t);
  }, [noiseUntil]);
  const noisy = Date.now() < noiseUntil;
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
        <div onPointerDown={(e) => drag(e, 'move')} className="flex cursor-grab touch-none items-center gap-2 px-1.5 pb-1.5 text-white active:cursor-grabbing">
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
          {track && <PipVideo track={track} />}
          {(!track || noisy) && <TvStatic />}
          {!track && !noisy && (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner />
            </div>
          )}
          {channels.length > 0 && (
            <span className="plaza-pixel pointer-events-none absolute top-1.5 right-2 text-[13px] font-bold text-[#7dff9a] [text-shadow:0_0_6px_#2e9e6a]">
              CH {Math.max(0, ch) + 1}
            </span>
          )}
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
          {/* trocar de canal: as outras transmissões da call */}
          <button onClick={() => zap(-1)} title="Canal anterior" aria-label="Canal anterior" className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#1b1430] bg-[#e8685a] hover:brightness-110 active:scale-90">
            <ChevronLeft size={13} />
          </button>
          <span className="plaza-pixel min-w-[34px] text-center text-[11px] text-white/70">
            {Math.max(0, ch) + 1}/{Math.max(1, channels.length)}
          </span>
          <button onClick={() => zap(1)} title="Próximo canal" aria-label="Próximo canal" className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#1b1430] bg-[#f5c451] text-[#1b1430] hover:brightness-110 active:scale-90">
            <ChevronRight size={13} />
          </button>
          {/* canto para redimensionar */}
          <span onPointerDown={(e) => drag(e, 'resize')} title="Arraste para redimensionar" className="ml-1 h-4 w-4 cursor-nwse-resize touch-none rounded-sm max-md:h-6 max-md:w-6 bg-[linear-gradient(135deg,transparent_50%,rgba(255,255,255,0.45)_50%)]" />
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

/** Chiado de TV antiga: pontinhos cinza mudando a cada quadro, com linhas de varredura. */
function TvStatic() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    let raf = 0;
    const frame = () => {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // faixa mais clara rolando, como a TV fora de sintonia
      const band = (performance.now() / 6) % canvas.height;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, band, canvas.width, 8);
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="absolute inset-0">
      <canvas ref={ref} width={160} height={90} className="h-full w-full [image-rendering:pixelated]" />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.25)_0_1px,transparent_1px_3px)]" />
    </div>
  );
}

/** O som do chiado (ruído branco curto e baixinho), no volume da mini TV. */
function playStatic(volume: number, seconds: number) {
  if (volume <= 0 || typeof AudioContext === 'undefined') return;
  try {
    const ac = new AudioContext();
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.06 * Math.min(1, volume), ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + seconds);
    src.connect(gain).connect(ac.destination);
    src.start();
    src.onended = () => void ac.close();
  } catch {
    // sem áudio: só a imagem
  }
}
