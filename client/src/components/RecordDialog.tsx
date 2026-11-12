// Janela "Gravar a sala": escolher o que gravar e onde salvar. O aviso de consentimento fica bem à vista.
import { Circle, FolderOpen, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canPickFolder, type RecordMode } from '../lib/callRecorder';
import { VIDEO_QUALITY, canRecordVideo, type VideoQuality } from '../lib/callVideo';
import { pickRecordingFolder, useRecording } from '../store/recording';
import { Button, Toggle, cx } from './ui';

const MODES: { id: RecordMode; title: string; hint: string }[] = [
  { id: 'mixed', title: 'Tudo junto', hint: 'Um arquivo com todas as vozes. Para guardar a conversa.' },
  { id: 'tracks', title: 'Uma faixa por pessoa', hint: 'Um arquivo para cada um, sincronizados. Para editar, como podcast.' },
  { id: 'both', title: 'Os dois', hint: 'O arquivo com todos e as faixas separadas.' },
];

export function RecordDialog() {
  const open = useRecording((s) => s.dialog);
  const status = useRecording((s) => s.status);
  const close = useRecording((s) => s.closeDialog);
  const start = useRecording((s) => s.start);
  const [mode, setMode] = useState<RecordMode>('mixed');
  const [streamAudio, setStreamAudio] = useState(true);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [video, setVideo] = useState<VideoQuality | null>(null);
  // vídeo pesa muito para ficar na memória até o fim: só gravando direto numa pasta
  const videoOk = canRecordVideo() && canPickFolder();
  const folders = canPickFolder();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const choose = async () => {
    const d = await pickRecordingFolder();
    if (d && d !== 'cancelled') setDir(d);
  };

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Gravar a sala" className="w-full max-w-md animate-pop-in rounded-[28px] bg-surface-2 p-6 shadow-2xl ring-1 ring-line">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Circle size={18} fill="currentColor" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-extrabold">Gravar a sala</h2>
            <p className="text-sm text-fg-muted">Grava a call no seu computador: as vozes e, se quiser, o vídeo.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="rounded-full p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1.5" role="radiogroup" aria-label="O que gravar">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx('flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1', mode === m.id ? 'bg-accent/10 ring-accent' : 'ring-line hover:bg-surface-3')}
            >
              <span className={cx('mt-0.5 h-4 w-4 shrink-0 rounded-full border-2', mode === m.id ? 'border-[5px] border-accent' : 'border-line-strong')} />
              <span>
                <span className="block text-sm font-bold">{m.title}</span>
                <span className="block text-xs text-fg-muted">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-3 rounded-2xl p-3 ring-1 ring-line">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Incluir o áudio das transmissões</span>
            <span className="block text-xs text-fg-muted">O som de jogos e vídeos que alguém estiver transmitindo.</span>
          </span>
          <Toggle checked={streamAudio} onChange={setStreamAudio} />
        </label>

        <div className="mt-3 rounded-2xl p-3 ring-1 ring-line">
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Gravar o vídeo da sala</span>
              <span className="block text-xs text-fg-muted">
                {videoOk ? 'A tela transmitida e as câmeras, com todas as vozes, num arquivo de vídeo.' : 'O vídeo precisa do Chrome, do Edge ou do app do Concord (grava direto numa pasta).'}
              </span>
            </span>
            <Toggle checked={!!video} disabled={!videoOk} onChange={(on) => setVideo(on ? '1080p30' : null)} />
          </label>
          {video && (
            <>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(Object.keys(VIDEO_QUALITY) as VideoQuality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setVideo(q)}
                    className={cx('rounded-full px-3 py-1 text-xs font-bold', video === q ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
                  >
                    {VIDEO_QUALITY[q].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-fg-subtle">
                Gravar vídeo usa mais processador e internet (você passa a receber todas as transmissões da sala). Deixe o Concord aberto enquanto grava; no app do Concord pode minimizar.
              </p>
            </>
          )}
        </div>

        <div className="mt-3 rounded-2xl p-3 ring-1 ring-line">
          <div className="text-sm font-semibold">Onde salvar</div>
          {folders ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{dir ? `Pasta: ${dir.name} (uma subpasta por gravação)` : 'Escolha uma pasta. Os arquivos vão sendo salvos enquanto grava.'}</span>
              <Button variant="secondary" className="h-8 shrink-0 px-3 text-xs" onClick={() => void choose()}>
                <FolderOpen size={14} />
                {dir ? 'Trocar' : 'Escolher pasta'}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-fg-muted">Neste navegador os arquivos baixam quando você parar. No Chrome, no Edge ou no app do Concord dá para gravar direto numa pasta.</p>
          )}
        </div>

        <div className="mt-4 flex gap-2.5 rounded-2xl bg-warn/12 p-3 text-xs">
          <ShieldCheck size={16} className="mt-px shrink-0 text-fg" />
          <p>
            <b>Todo mundo na sala vai ver que você está gravando</b>, e quem entrar depois também. Peça licença antes: gravar a voz dos outros sem avisar não é legal.
            A gravação fica só no seu computador; nada dela vai para o Concord.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={status === 'starting'}
            disabled={folders && !dir}
            onClick={() => void start({ mode, streamAudio, dir, video })}
          >
            <Circle size={12} fill="currentColor" />
            Começar a gravar
          </Button>
        </div>
      </div>
    </div>
  );
}
