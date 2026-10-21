// Controles da gravação de diagnóstico (Gravar · Marcar momento · Parar e salvar). Os mesmos
// botões aparecem na aba Desenvolvedor, na janela de diagnóstico e no indicador do app; a gravação
// em si roda na janela principal (lib/devRecording.ts).
import { useEffect, useState } from 'react';
import { useDevRecording, type RecordingState } from '../lib/devRecording';
import { currentShortcuts } from '../lib/shortcuts';
import { useApp } from '../store/app';
import { cx } from './ui';

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Segundos desde o início, atualizando a cada segundo enquanto grava. */
function useElapsed(startedAt: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
}

interface Props {
  state: RecordingState;
  onStart: () => void;
  onStop: () => void;
  onMark: (note: string) => void;
  /** sem dados ainda (ex.: janela de diagnóstico esperando a principal) */
  disabled?: boolean;
  className?: string;
}

export function RecordControls({ state, onStart, onStop, onMark, disabled, className }: Props) {
  const [note, setNote] = useState('');
  const elapsed = useElapsed(state.recording ? state.startedAt : null);
  // o atalho só é lido aqui para mostrar na dica; quem reage a ele é lib/shortcuts.ts
  const markKey = useApp((s) => (s.me ? currentShortcuts().devMark : ''));

  if (!state.recording) {
    return (
      <div className={cx('flex flex-wrap items-center gap-3 text-xs text-fg-muted', className)}>
        <button
          onClick={onStart}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 font-bold text-danger hover:bg-danger/25 disabled:opacity-40"
        >
          <span className="h-2 w-2 rounded-full bg-danger" /> Gravar
        </button>
        <span>Grava os dados de diagnóstico a cada 2 s e, ao parar, salva um arquivo .json para enviar e analisar.</span>
      </div>
    );
  }
  return (
    <div className={cx('flex flex-wrap items-center gap-2 text-xs', className)}>
      <span className="flex items-center gap-1.5 font-bold text-danger">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Gravando {mmss(elapsed)}
      </span>
      <span className="text-fg-muted">
        {state.count} leitura(s) · {state.markers} marcação(ões)
      </span>
      <form
        className="ml-auto flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onMark(note);
          setNote('');
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que aconteceu? (ex.: travou agora)"
          className="w-56 rounded-full bg-surface-3 px-3 py-1 outline-none focus:ring-2 focus:ring-accent/60"
        />
        <button
          type="submit"
          className="rounded-full bg-surface-3 px-3 py-1 font-bold hover:bg-surface-4"
          title={markKey ? `Marca este instante na gravação (atalho: ${markKey})` : 'Marca este instante na gravação'}
        >
          Marcar momento
        </button>
      </form>
      <button onClick={onStop} className="rounded-full bg-danger px-3 py-1 font-bold text-white hover:opacity-90">
        Parar e salvar
      </button>
    </div>
  );
}

/** Controles ligados direto à gravação desta janela (aba Desenvolvedor). */
export function LocalRecordControls({ className }: { className?: string }) {
  const rec = useDevRecording();
  return <RecordControls state={rec} onStart={rec.start} onStop={rec.stop} onMark={rec.mark} className={className} />;
}

/** Indicador no canto do app enquanto grava: dá para marcar e parar sem abrir nada. */
export function RecordingPill() {
  const rec = useDevRecording();
  const elapsed = useElapsed(rec.recording ? rec.startedAt : null);
  if (!rec.recording) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 animate-pop-in items-center gap-2 rounded-full bg-popover py-1.5 pr-1.5 pl-4 text-xs shadow-2xl ring-1 ring-line">
      <span className="flex items-center gap-1.5 font-bold text-danger">
        <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> Gravando diagnóstico {mmss(elapsed)}
      </span>
      <span className="text-fg-muted">· {rec.markers} marcação(ões)</span>
      <button onClick={() => rec.mark('marcado pelo app')} className="rounded-full bg-surface-3 px-3 py-1 font-bold hover:bg-surface-4">
        Marcar
      </button>
      <button onClick={rec.stop} className="rounded-full bg-danger px-3 py-1 font-bold text-white hover:opacity-90">
        Parar e salvar
      </button>
    </div>
  );
}
