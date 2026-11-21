// Papo de uma sala de voz numa janelinha flutuante (botão de balão ao lado da engrenagem da sala, na lista de canais):
// lê e escreve no chat da sala sem entrar nela, sem sair da call em que já está e sem trocar a tela aberta.
import { MessageSquare, Volume2, X } from 'lucide-react';
import { create } from 'zustand';
import { useActiveDetail } from '../store/app';
import { Composer, MessageFeed } from './ChatView';

interface RoomChatState {
  open: { serverId: string; channelId: string } | null;
  show: (serverId: string, channelId: string) => void;
  close: () => void;
}

export const useRoomChat = create<RoomChatState>((set, get) => ({
  open: null,
  // o mesmo botão abre e fecha
  show: (serverId, channelId) => set({ open: get().open?.channelId === channelId ? null : { serverId, channelId } }),
  close: () => set({ open: null }),
}));

/** O botão da lista de canais (ao lado esquerdo da engrenagem). */
export function RoomChatButton({ serverId, channelId, name }: { serverId: string; channelId: string; name: string }) {
  const open = useRoomChat((s) => s.open?.channelId === channelId);
  return (
    <button
      type="button"
      title={open ? `Fechar o papo de ${name}` : `Abrir o papo de ${name} (sem entrar na sala)`}
      aria-label={open ? `Fechar o papo de ${name}` : `Abrir o papo de ${name}`}
      aria-pressed={open}
      onClick={(e) => {
        e.stopPropagation();
        useRoomChat.getState().show(serverId, channelId);
      }}
      className={
        open
          ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent'
          : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-muted opacity-0 transition-colors group-hover:opacity-100 hover:bg-surface-4 hover:text-fg focus:opacity-100'
      }
    >
      <MessageSquare size={14} />
    </button>
  );
}

/** A janelinha em si: no canto de baixo, por cima de tudo, sem escurecer nem bloquear o resto do app. */
export function RoomChatDock() {
  const open = useRoomChat((s) => s.open);
  const close = useRoomChat((s) => s.close);
  const detail = useActiveDetail();
  // o chat usa o servidor aberto (membros, cargos): trocou de servidor, a janelinha some até voltar
  const channel = open && detail?.server.id === open.serverId ? detail.channels.find((c) => c.id === open.channelId) : undefined;
  if (!open || !channel) return null;
  return (
    <section
      aria-label={`Papo de ${channel.name}`}
      className="fixed right-2 bottom-2 left-2 z-40 flex h-[min(560px,70vh)] animate-pop-in flex-col overflow-hidden rounded-[24px] bg-surface-2 shadow-2xl ring-1 ring-line-strong sm:left-auto sm:w-[400px] md:right-4 md:bottom-4"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <Volume2 size={16} className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold">{channel.name}</div>
          <div className="text-[11px] text-fg-subtle">Papo da sala · você não entra na call</div>
        </div>
        <button type="button" onClick={close} title="Fechar" aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </header>
      <MessageFeed channel={channel} compact />
      <Composer channel={channel} compact />
    </section>
  );
}
