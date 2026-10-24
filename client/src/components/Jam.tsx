// Jams do Spotify na sala de voz. O Spotify não deixa criar Jam por API: quem quer puxar cria no app do
// Spotify, copia o convite e cola aqui (ou no chat da sala). Cada pessoa da sala pode ter a sua: o botão do
// topo mostra uma, e a setinha ao lado lista todas para escolher em qual entrar. Só quem fixou tira, e a Jam
// sai sozinha quando a pessoa sai da sala (ver server/src/realtime.ts).
import { ChevronDown, Music2, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { memberName, type Channel, type Jam, type Member, type ServerDetail } from '../lib/types';
import { useActiveDetail, useApp } from '../store/app';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { Avatar, Button, Input, Modal, cx } from './ui';

const SPOTIFY_GREEN = '#1DB954';

/** O símbolo do Spotify (as três ondas no círculo). */
export function SpotifyLogo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <circle cx="12" cy="12" r="12" fill={SPOTIFY_GREEN} />
      <path
        fill="#000"
        d="M17.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z"
      />
    </svg>
  );
}

const jamLabel = (jam: Jam, host: Member | undefined, myId: string) => (jam.hostId === myId ? 'Sua Jam' : `Jam de ${host ? memberName(host) : 'alguém'}`);

/** Botão das Jams no topo da sala. */
export function JamButton({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const me = useApp((s) => s.me)!;
  const roomJams = useApp((s) => s.jams[detail.server.id]?.filter((j) => j.channelId === channel.id)) ?? [];
  const inRoom = useVoice((s) => s.channelId === channel.id && s.status === 'connected');
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const mine = roomJams.find((j) => j.hostId === me.id);
  // no botão: a sua, se tiver; senão a mais recente
  const main = mine ?? [...roomJams].sort((a, b) => b.startedAt - a.startedAt)[0];
  const hostOf = (j: Jam) => detail.members.find((m) => m.id === j.hostId);
  const removeMine = () => void api.del(`/channels/${channel.id}/jam`).catch(toast.error);
  const modal = creating && <JamModal channel={channel} replacing={!!mine} onClose={() => setCreating(false)} />;

  if (!main) {
    if (!inRoom) return null;
    return (
      <>
        <button
          onClick={() => setCreating(true)}
          data-tour="jam"
          title="Ouvir junto com uma Jam do Spotify"
          className="flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-bold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <SpotifyLogo size={18} /> Jam
        </button>
        {modal}
      </>
    );
  }

  const others = roomJams.length - 1;
  return (
    <div ref={menuRef} className="relative">
      <div className="flex items-center overflow-hidden rounded-full text-sm font-bold text-black" style={{ background: SPOTIFY_GREEN }}>
        <a href={main.url} target="_blank" rel="noreferrer noopener" data-tour="jam" title="Abre a Jam no Spotify" className="flex h-10 items-center gap-2 pr-3 pl-3.5 hover:bg-black/10">
          <Music2 size={16} />
          <span className="max-w-44 truncate">{jamLabel(main, hostOf(main), me.id)}</span>
          <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">Entrar</span>
        </a>
        <button
          aria-label={others ? `Ver as ${roomJams.length} Jams da sala` : 'Mais opções da Jam'}
          title={others ? `${roomJams.length} Jams na sala` : 'Mais opções'}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="flex h-10 items-center gap-1 border-l border-black/15 px-2.5 hover:bg-black/10"
        >
          {others > 0 && <span className="text-xs">+{others}</span>}
          <ChevronDown size={15} className={cx('transition-transform', menu && 'rotate-180')} />
        </button>
      </div>

      {menu && (
        <div className="absolute top-full right-0 z-30 mt-2 w-72 animate-pop-in space-y-1 rounded-3xl bg-popover p-2 shadow-2xl ring-1 ring-line">
          <div className="px-3 pt-1 pb-1.5 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">Jams nesta sala</div>
          {roomJams.map((j) => {
            const host = hostOf(j);
            return (
              <a
                key={j.hostId}
                href={j.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => setMenu(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-4"
              >
                {host ? <Avatar name={memberName(host)} color={host.avatarColor} src={host.avatarUrl} size={30} /> : <SpotifyLogo size={30} />}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{jamLabel(j, host, me.id)}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold text-black" style={{ background: SPOTIFY_GREEN }}>
                  Entrar
                </span>
              </a>
            );
          })}
          {inRoom && (
            <>
              <div className="mx-2 my-1 h-px bg-line" />
              <button
                onClick={() => {
                  setMenu(false);
                  setCreating(true);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-fg-muted hover:bg-surface-4 hover:text-fg"
              >
                <Plus size={16} /> {mine ? 'Trocar o link da minha Jam' : 'Criar minha Jam'}
              </button>
              {mine && (
                <button
                  onClick={() => {
                    setMenu(false);
                    removeMine();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger/15"
                >
                  <X size={16} /> Tirar minha Jam da sala
                </button>
              )}
            </>
          )}
        </div>
      )}
      {modal}
    </div>
  );
}

function JamModal({ channel, replacing, onClose }: { channel: Channel; replacing: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function pin(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/channels/${channel.id}/jam`, { url });
      toast.success(replacing ? 'Link da sua Jam trocado.' : 'Jam fixada! Todo mundo na sala já pode entrar.');
      onClose();
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  const step = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-black';
  return (
    <Modal
      title={
        <span className="flex items-center gap-2.5">
          <SpotifyLogo size={26} /> {replacing ? 'Trocar o link da sua Jam' : 'Sua Jam do Spotify na sala'}
        </span>
      }
      subtitle="Todo mundo da sala ouve a mesma música, cada um no seu Spotify, e todo mundo pode pôr música na fila."
      onClose={onClose}
    >
      <ol className="space-y-4 text-sm">
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>
            1
          </span>
          <p>Abra o Spotify e comece uma Jam: na música que está tocando, toque no ícone de Jam (ou em ⋯ → Iniciar uma Jam).</p>
        </li>
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>
            2
          </span>
          <p>Na Jam, toque em Convidar e depois em Copiar link.</p>
        </li>
        <li className="flex gap-3">
          <span className={step} style={{ background: SPOTIFY_GREEN }}>
            3
          </span>
          <form onSubmit={(e) => void pin(e)} className="flex-1 space-y-2">
            <p>Cole o link aqui:</p>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://spotify.link/…" autoFocus aria-label="Link da Jam" />
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!url.trim()}>
                {replacing ? 'Trocar' : 'Fixar na sala'}
              </Button>
            </div>
          </form>
        </li>
      </ol>
      <p className="mt-4 rounded-2xl bg-surface-0 p-3 text-xs text-fg-muted">
        Dica: colar o link da Jam no chat da sala também fixa ela. Cada pessoa da sala pode ter a sua, e só você tira a sua. Entrar numa Jam de outra pessoa pede Spotify
        Premium. A sua Jam sai daqui quando você sai da sala.
      </p>
    </Modal>
  );
}

// ------------------------------------------------------------------ cartão no chat

const JAM_SESSION = /https:\/\/open\.spotify\.com\/socialsession\/[A-Za-z0-9]+(?:\?[^\s<>"]*)?/;
const SHORT_LINK = /https:\/\/(?:spotify\.link|spotify\.app\.link)\/[A-Za-z0-9]+/;

/**
 * O link de Jam numa mensagem, se tiver. O link completo é sempre de Jam; o curto do celular também serve
 * para música e playlist, então só conta quando é o de uma Jam fixada agora.
 */
export function useJamInMessage(content: string): { url: string; jam: Jam | null } | null {
  const detail = useActiveDetail();
  const jams = useApp((s) => (detail ? s.jams[detail.server.id] : undefined));
  const full = JAM_SESSION.exec(content)?.[0];
  const short = SHORT_LINK.exec(content)?.[0];
  const link = full ?? short;
  if (!link) return null;
  const jam = jams?.find((j) => j.url === link || j.sourceUrl === link || (full && j.url.startsWith(full.split('?')[0]))) ?? null;
  if (!full && !jam) return null;
  return { url: jam?.url ?? link, jam };
}

/** A mensagem com link de Jam vira um cartão com o símbolo do Spotify e o botão de entrar. */
export function JamCard({ url, jam, authorName, mine }: { url: string; jam: Jam | null; authorName: string; mine: boolean }) {
  const detail = useActiveDetail();
  const me = useApp((s) => s.me)!;
  const host = jam && detail?.members.find((m) => m.id === jam.hostId);
  const room = jam && detail?.channels.find((c) => c.id === jam.channelId);
  const title = jam ? jamLabel(jam, host ?? undefined, me.id) : mine ? 'Sua Jam' : `Jam de ${authorName}`;
  return (
    <div className="flex w-[min(340px,70vw)] items-center gap-3 rounded-[22px] bg-[#121212] p-3 text-white ring-1 ring-white/10">
      <SpotifyLogo size={44} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-bold tracking-widest text-[#1DB954] uppercase">Jam do Spotify</div>
        <div className="truncate font-display font-bold">{title}</div>
        <div className="truncate text-xs text-white/60">{jam ? `Rolando agora${room ? ` em ${room.name}` : ''}` : 'Pode já ter acabado'}</div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="shrink-0 rounded-full px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
        style={{ background: SPOTIFY_GREEN }}
      >
        Entrar
      </a>
    </div>
  );
}
