import { Clapperboard, Smartphone, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PRANK_EFFECTS } from '../../../shared/contracts.ts';
import { api } from '../lib/api';
import { memberName, type Channel, type ServerDetail } from '../lib/types';
import { EFFECTS } from '../lib/voiceEffects';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Avatar, cx } from './ui';

/** Selo em cima do nome da sala quando o modo gravação da equipe está ligado. */
export function RecordingPill({ className }: { className?: string }) {
  return (
    <span
      title="A equipe do Concord está gravando esta sala para um vídeo (com o programa dela, não pelo Concord)"
      className={cx('inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold text-live', className)}
    >
      <span className="recording-dot h-2 w-2 rounded-full bg-live" />
      Gravando
    </span>
  );
}

const DURATIONS = [3, 5, 10, 15];

/**
 * Controles do modo gravação no cabeçalho da sala (só a equipe, nas salas do servidor da equipe):
 * ligar/desligar e o painel de direção para disparar efeitos em quem está na sala.
 */
export function RecordingControls({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recording = !!channel.recording;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!channel.canRecord) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      await api.post(`/channels/${channel.id}/recording`, { on: !recording });
      if (recording) setOpen(false);
    } catch (err) {
      toast.error(err);
    }
    setBusy(false);
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        title={recording ? 'Desligar o modo gravação' : 'Ligar o modo gravação (desliga sozinho em 3 h)'}
        className={cx(
          'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-60',
          recording ? 'bg-live text-white hover:bg-live/85' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
        )}
      >
        {recording ? <Square size={13} fill="currentColor" /> : <span className="h-2.5 w-2.5 rounded-full bg-live" />}
        {recording ? 'Parar' : 'Gravar'}
      </button>
      {recording && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title="Painel de direção"
          className={cx(
            'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors',
            open ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg hover:bg-surface-4',
          )}
        >
          <Clapperboard size={15} /> Direção
        </button>
      )}
      {open && recording && <DirectorPanel detail={detail} channel={channel} />}
    </div>
  );
}

function DirectorPanel({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const me = useApp((s) => s.me);
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const sounds = useApp((s) => s.sounds[detail.server.id]);
  const loadSounds = useApp((s) => s.loadSounds);
  const inRoom = states
    .filter((v) => v.channelId === channel.id)
    .flatMap((v) => {
      const m = detail.members.find((x) => x.id === v.userId);
      return m ? [m] : [];
    });
  const [target, setTarget] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(5);
  const picked = inRoom.find((m) => m.id === target) ?? inRoom.find((m) => m.id !== me?.id) ?? inRoom[0];

  useEffect(() => {
    if (!sounds) void loadSounds(detail.server.id);
  }, [sounds, loadSounds, detail.server.id]);

  const fire = async (body: Record<string, unknown>, done: string) => {
    if (!picked) return;
    try {
      await api.post(`/channels/${channel.id}/director`, { userId: picked.id, ...body });
      toast.success(done);
    } catch (err) {
      toast.error(err);
    }
  };

  const playSound = async (id: string, name: string) => {
    try {
      await api.post(`/sounds/${id}/play`);
      toast.success(`Tocando "${name}" para a sala`);
    } catch (err) {
      toast.error(err);
    }
  };

  const effects = EFFECTS.filter((e) => (PRANK_EFFECTS as readonly string[]).includes(e.id));

  return (
    <div
      role="dialog"
      aria-label="Painel de direção"
      className="absolute top-full right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-24px)] animate-pop-in rounded-[22px] border border-line-strong bg-surface-2 p-4 shadow-2xl"
    >
      {inRoom.length === 0 ? (
        <p className="text-sm text-fg-muted">Ninguém na sala ainda.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quem">
            {inRoom.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={picked?.id === m.id}
                title={memberName(m)}
                onClick={() => setTarget(m.id)}
                className={cx('rounded-full p-0.5 transition-all', picked?.id === m.id ? 'ring-[3px] ring-accent' : 'opacity-70 hover:opacity-100')}
              >
                <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={38} />
              </button>
            ))}
          </div>
          {picked && <div className="-mt-2 text-sm font-bold">{memberName(picked)}</div>}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-fg-muted">Voz</span>
              <div className="flex gap-1">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSeconds(d)}
                    className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', seconds === d ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg-muted')}
                  >
                    {d} s
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {effects.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={e.hint}
                  onClick={() => void fire({ action: 'fx', effect: e.id, durationMs: seconds * 1000 }, `${e.label} em ${picked ? memberName(picked) : ''}`)}
                  className="rounded-xl bg-surface-3 px-1 py-2 text-[11px] font-semibold hover:bg-accent hover:text-on-accent"
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void fire({ action: 'shake' }, `Tela de ${picked ? memberName(picked) : ''} tremendo`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-2/15 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent-2/25"
          >
            <Smartphone size={16} /> Tremer a tela
          </button>

          {!!sounds?.length && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
                <Volume2 size={13} /> Mesa de sons (toca para a sala)
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {sounds.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void playSound(s.id, s.name)}
                    className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold hover:bg-surface-4"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
