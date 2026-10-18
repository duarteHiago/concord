import { Music2, Plus, Trash2, Upload, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api, getToken } from '../lib/api';
import { setSoundboardVolume, soundboardVolume, type SoundPlayed } from '../lib/soundboard';
import type { Sound } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Button, Spinner, cx } from './ui';

const MAX_SECONDS = 15;

/** Botão + painel da mesa de sons, usado na barra de controles da sala. */
export function SoundboardButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        title="Mesa de sons"
        aria-label="Mesa de sons"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
          open ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg hover:bg-surface-4',
        )}
      >
        <Music2 size={20} />
      </button>
      {open && <SoundboardPanel />}
    </div>
  );
}

function SoundboardPanel() {
  const serverId = useVoice((s) => s.serverId)!;
  const channelId = useVoice((s) => s.channelId);
  const sounds = useApp((s) => s.sounds[serverId]);
  const loadSounds = useApp((s) => s.loadSounds);
  const detail = useApp((s) => s.details[serverId]);
  const me = useApp((s) => s.me)!;
  const [volume, setVolume] = useState(soundboardVolume);
  const [adding, setAdding] = useState(false);
  const channel = detail?.channels.find((c) => c.id === channelId);
  const canUse = channel ? has(channel.permissions, P.USE_SOUNDBOARD) : false;
  const canManage = detail ? has(detail.permissions, P.MANAGE_SERVER) : false;

  useEffect(() => {
    if (!sounds) void loadSounds(serverId);
  }, [serverId, sounds, loadSounds]);

  async function play(sound: Sound) {
    try {
      await api.post(`/sounds/${sound.id}/play`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="absolute bottom-full left-1/2 z-30 mb-3 w-[min(420px,90vw)] -translate-x-1/2 animate-pop-in rounded-[24px] bg-surface-2 p-4 shadow-2xl ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold">Mesa de sons</h3>
        <label className="flex items-center gap-2 text-xs text-fg-muted" title="Volume dos sons para você">
          <Volume2 size={14} />
          <span className="sr-only">Volume da mesa de sons</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setSoundboardVolume(Number(e.target.value));
            }}
            className="w-24"
          />
        </label>
      </div>

      {!canUse && <p className="mb-3 rounded-2xl bg-warn/10 px-3 py-2 text-sm text-warn">Você não pode usar a mesa de sons nesta sala.</p>}

      {!sounds ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {sounds.map((s) => (
            <div key={s.id} className="group relative">
              <button
                disabled={!canUse}
                onClick={() => void play(s)}
                className="h-12 w-full truncate rounded-2xl bg-surface-3 px-3 text-sm font-semibold transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-40"
                title={`Tocar "${s.name}" para a sala`}
              >
                {s.name}
              </button>
              {(s.uploaderId === me.id || canManage) && (
                <button
                  aria-label={`Apagar ${s.name}`}
                  title="Apagar som"
                  onClick={() => void api.del(`/sounds/${s.id}`).catch(toast.error)}
                  className="absolute -top-1.5 -right-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow group-hover:flex"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {canUse && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong text-sm font-semibold text-fg-muted hover:border-accent hover:text-accent"
            >
              <Plus size={16} /> Adicionar
            </button>
          )}
        </div>
      )}
      {sounds?.length === 0 && !adding && <p className="mt-2 text-sm text-fg-muted">Ainda não há sons. Envie o primeiro!</p>}
      {adding && <AddSound serverId={serverId} onDone={() => setAdding(false)} />}
    </div>
  );
}

function AddSound({ serverId, onDone }: { serverId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function choose(f: File | undefined) {
    setError('');
    if (!f) return;
    if (f.size > 1024 * 1024) return setError('O arquivo passa de 1 MB.');
    const seconds = await duration(f).catch(() => 0);
    if (seconds > MAX_SECONDS + 0.5) return setError(`O som tem ${Math.round(seconds)}s; o máximo é ${MAX_SECONDS}s.`);
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, '').slice(0, 32));
  }

  async function upload() {
    if (!file || !name.trim()) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/servers/${serverId}/sounds?name=${encodeURIComponent(name.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      toast.success(`"${name.trim()}" adicionado à mesa de sons`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-surface-0 p-3">
      <input ref={input} type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/webm,.mp3,.ogg,.wav,.webm" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
      {!file ? (
        <Button variant="secondary" className="w-full" onClick={() => input.current?.click()}>
          <Upload size={16} /> Escolher arquivo (MP3, OGG, WAV · até {MAX_SECONDS}s)
        </Button>
      ) : (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="sound-name">
            Nome do som
          </label>
          <input
            id="sound-name"
            value={name}
            maxLength={32}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void upload()}
            className="h-10 min-w-0 flex-1 rounded-full bg-surface-3 px-4 text-sm outline-none focus:ring-2 focus:ring-accent/60"
            placeholder="Nome do som"
          />
          <Button className="h-10" loading={loading} disabled={!name.trim()} onClick={upload}>
            Enviar
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        {error ? <p className="text-sm text-danger">{error}</p> : <span />}
        <button onClick={onDone} className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <X size={12} /> cancelar
        </button>
      </div>
    </div>
  );
}

function duration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('arquivo inválido'));
    };
    audio.src = url;
  });
}

/** Aviso "Fulano tocou X" sobre o palco da sala. */
export function SoundToast() {
  const [last, setLast] = useState<SoundPlayed | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLast((e as CustomEvent<SoundPlayed>).detail);
    window.addEventListener('concord:sound', on);
    return () => window.removeEventListener('concord:sound', on);
  }, []);
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 2500);
    return () => clearTimeout(t);
  }, [last]);
  if (!last) return null;
  return (
    <div className="pointer-events-none absolute top-5 left-1/2 z-10 -translate-x-1/2 animate-pop-in rounded-full bg-surface-1/90 px-4 py-1.5 text-sm font-semibold backdrop-blur">
      <Music2 size={14} className="mr-1.5 inline text-accent" />
      {last.by} tocou <b>{last.name}</b>
    </div>
  );
}
