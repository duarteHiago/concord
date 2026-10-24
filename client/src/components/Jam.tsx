// Jam do Spotify na sala de voz. O Spotify não deixa criar Jam por API: quem quer puxar cria no app do
// Spotify, copia o convite e cola aqui (ou no chat da sala). Aí a sala inteira vê "Entrar na Jam" e entra
// com um clique. A Jam sai sozinha quando quem colou sai da sala (ver server/src/realtime.ts).
import { ExternalLink, Music2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { memberName, type Channel, type ServerDetail } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Button, Input, Modal, cx } from './ui';

const SPOTIFY_GREEN = '#1DB954';

/** Botão da Jam no topo da sala: "Entrar na Jam" quando tem uma, "Jam" para fixar quando não tem. */
export function JamButton({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const me = useApp((s) => s.me)!;
  const jam = useApp((s) => s.jams[detail.server.id]?.find((j) => j.channelId === channel.id));
  const inRoom = useVoice((s) => s.channelId === channel.id && s.status === 'connected');
  const [open, setOpen] = useState(false);

  if (jam) {
    const host = detail.members.find((m) => m.id === jam.hostId);
    const mine = jam.hostId === me.id;
    const canEnd = mine || has(channel.permissions, P.MOVE_MEMBERS);
    return (
      <div className="flex items-center overflow-hidden rounded-full text-sm font-bold text-black" style={{ background: SPOTIFY_GREEN }}>
        <a
          href={jam.url}
          target="_blank"
          rel="noreferrer noopener"
          data-tour="jam"
          title="Abre a Jam no Spotify"
          className="flex h-10 items-center gap-2 pr-3 pl-4 hover:bg-black/10"
        >
          <Music2 size={16} />
          <span className="max-w-48 truncate">{mine ? 'Sua Jam' : `Jam ${host ? `de ${memberName(host)}` : 'da sala'}`}</span>
          <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">Entrar</span>
        </a>
        {canEnd && (
          <button
            aria-label="Tirar a Jam da sala"
            title="Tirar a Jam da sala"
            onClick={() => void api.del(`/channels/${channel.id}/jam`).catch(toast.error)}
            className="flex h-10 w-9 items-center justify-center border-l border-black/15 hover:bg-black/10"
          >
            <X size={15} />
          </button>
        )}
      </div>
    );
  }

  if (!inRoom) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tour="jam"
        title="Ouvir junto com uma Jam do Spotify"
        className="flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
      >
        <Music2 size={16} style={{ color: SPOTIFY_GREEN }} /> Jam
      </button>
      {open && <JamModal channel={channel} onClose={() => setOpen(false)} />}
    </>
  );
}

function JamModal({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function pin(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/channels/${channel.id}/jam`, { url });
      toast.success('Jam fixada! Todo mundo na sala já pode entrar.');
      onClose();
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  const step = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-black';
  return (
    <Modal title="Jam do Spotify na sala" subtitle="Todo mundo da sala ouve a mesma música, cada um no seu Spotify, e todo mundo pode pôr música na fila." onClose={onClose}>
      <ol className="space-y-4 text-sm">
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>1</span>
          <div className="space-y-2">
            <p>Abra o Spotify e comece uma Jam: na música que está tocando, toque no ícone de Jam (ou em ⋯ → Iniciar uma Jam).</p>
            <a
              href="https://open.spotify.com"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold hover:bg-surface-4"
            >
              Abrir o Spotify <ExternalLink size={12} />
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>2</span>
          <p>Na Jam, toque em Convidar e depois em Copiar link.</p>
        </li>
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>3</span>
          <form onSubmit={(e) => void pin(e)} className="flex-1 space-y-2">
            <p>Cole o link aqui:</p>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/socialsession/…" autoFocus aria-label="Link da Jam" />
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!url.trim()}>
                Fixar na sala
              </Button>
            </div>
          </form>
        </li>
      </ol>
      <p className={cx('mt-4 rounded-2xl bg-surface-0 p-3 text-xs text-fg-muted')}>
        Dica: colar o link da Jam no chat da sala também fixa ela. Entrar numa Jam de outra pessoa pede Spotify Premium. A Jam sai daqui quando você sai da sala.
      </p>
    </Modal>
  );
}
