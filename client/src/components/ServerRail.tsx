import { Download, Minus, Newspaper, MessageCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { desktop } from '../lib/desktop';
import { useUnseenReleases } from '../releases';
import { HOME, useApp } from '../store/app';
import { usePendingCount } from '../lib/friends';
import { useVoice } from '../store/voice';
import { useCommunity, usePendingCommunity } from '../store/community';
import { DragGhost, DrawerLine, pinnedServers, RAIL_MAX, ServerDrawerPanel, useServerDrag } from './ServerDrawer';
import { cx, initials } from './ui';

/** Fileira de servidores no topo da barra lateral. Mostra até RAIL_MAX servidores; o resto fica na gaveta. */
export function ServerStrip() {
  const servers = useApp((s) => s.servers);
  const activeId = useApp((s) => s.activeServerId);
  const openServer = useApp((s) => s.openServer);
  const openModal = useApp((s) => s.openModal);
  const voiceServer = useVoice((s) => s.serverId);
  // mensagens não lidas + pedidos de amizade esperando resposta
  const pending = usePendingCount();
  const unread = useApp((s) => (s.dms ?? []).reduce((n, d) => n + d.unread, 0)) + pending;
  const releasesOpen = useApp((s) => s.releasesOpen);
  const openReleases = useApp((s) => s.openReleases);
  const closeReleases = useApp((s) => s.closeReleases);
  const newReleases = useUnseenReleases().length > 0;
  const [download, setDownload] = useState<string | null>(null);
  // servidor oficial da comunidade: aparece aqui até a pessoa entrar
  const community = usePendingCommunity();
  const joining = useCommunity((s) => s.joining);
  const joinCommunity = useCommunity((s) => s.join);
  const savedPins = useApp((s) => s.me?.settings?.pinnedServers);
  const saveSettings = useApp((s) => s.saveSettings);
  const [drawer, setDrawer] = useState(false);
  const pinned = pinnedServers(servers, savedPins);
  const pinnedIds = pinned.map((s) => s.id);
  const savePins = (ids: string[]) => void saveSettings({ pinnedServers: ids.slice(0, RAIL_MAX) });
  // com a gaveta aberta, segurar um ícone e arrastar move servidores entre o topo e a gaveta
  const { drag, editing, setEditing, handle, preview } = useServerDrag(drawer, pinnedIds, savePins);
  const byId = new Map(servers.map((s) => [s.id, s]));
  const top = preview.map((id) => byId.get(id)).filter((s) => !!s);
  const rest = servers.filter((s) => !preview.includes(s.id));
  // servidor aberto que está na gaveta: aparece no topo enquanto estiver aberto, para não sumir da vista
  const extra = drawer ? undefined : servers.find((s) => s.id === activeId && !pinnedIds.includes(s.id));
  const shown = extra ? [...top, extra] : top;
  const dragged = drag ? byId.get(drag.id) : undefined;

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(false);
      else setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, editing, setEditing]);

  useEffect(() => {
    useCommunity.getState().load();
    if (desktop) return;
    api.get<{ desktopDownload: string | null }>('/config').then((c) => setDownload(c.desktopDownload), () => {});
  }, []);

  const tile = 'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] font-display text-base font-bold transition-all';

  const home = activeId === HOME && !releasesOpen;
  return (
    <div className="relative">
    <nav aria-label="Servidores" data-drop="top" data-index={top.length} className="flex gap-2 overflow-x-auto px-4 pt-4 pb-3 md:flex-wrap">
      <button
        title="Mensagens privadas"
        aria-label={`Mensagens privadas${unread ? ` (${unread} não lidas)` : ''}`}
        aria-current={home ? 'true' : undefined}
        onClick={() => openServer(HOME)}
        className={cx(tile, home ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg')}
      >
        <MessageCircle size={21} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-surface-2 bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {shown.map((s, i) => {
        const active = s.id === activeId && !releasesOpen;
        const isPinned = s !== extra;
        return (
          <div
            key={s.id}
            data-drop={isPinned ? 'top' : undefined}
            data-index={i}
            className={cx(
              'relative shrink-0 rounded-[18px]',
              editing && isPinned && 'server-drawer-jiggle',
              editing && i % 2 === 1 && 'server-drawer-jiggle-alt',
              drag?.id === s.id && 'opacity-30',
            )}
          >
            <button
              title={s.name}
              aria-label={s.name}
              aria-current={active ? 'true' : undefined}
              {...(isPinned ? handle(s.id) : {})}
              onClick={() => openServer(s.id)}
              className={cx(
                tile,
                // segurar para reordenar: sem a prévia da imagem nem o menu "salvar imagem" do celular
                drawer && 'touch-none select-none [-webkit-touch-callout:none]',
                active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
              )}
            >
              {s.iconUrl ? (
                <img
                  src={s.iconUrl}
                  alt=""
                  draggable={false}
                  className={cx('pointer-events-none h-full w-full rounded-[18px] object-cover select-none [-webkit-touch-callout:none]', active && 'ring-[3px] ring-accent')}
                />
              ) : (
                initials(s.name)
              )}
              {voiceServer === s.id && (
                <span title="Você está numa sala deste servidor" className="absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border-[3px] border-surface-2 bg-ok" />
              )}
            </button>
            {editing && isPinned && (
              <button
                type="button"
                aria-label={`Tirar ${s.name} do topo`}
                title="Tirar do topo"
                onClick={() => savePins(pinnedIds.filter((id) => id !== s.id))}
                className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface-2 bg-fg text-surface-1 shadow"
              >
                <Minus size={11} strokeWidth={3} />
              </button>
            )}
          </div>
        );
      })}
      {community && (
        <button
          title={`Entrar na comunidade: ${community.server.name} (ideias, bugs e ajuda)`}
          aria-label={`Entrar na comunidade ${community.server.name}`}
          onClick={() => void joinCommunity()}
          disabled={joining}
          className={cx(tile, 'bg-surface-3 hover:bg-surface-4 disabled:opacity-60')}
        >
          <img src="/brand/concord-simbolo.svg" alt="" className="h-9 w-9" />
          <span className="absolute -top-1 -right-1 flex h-5 items-center rounded-full border-[3px] border-surface-2 bg-accent px-1 text-[9px] font-extrabold text-on-accent">
            +
          </span>
        </button>
      )}
      <button
        title="Adicionar servidor"
        aria-label="Adicionar servidor"
        onClick={() => openModal({ type: 'addServer' })}
        className={cx(tile, 'border-2 border-dashed border-line-strong text-fg-muted hover:border-accent hover:text-accent')}
      >
        <Plus size={20} />
      </button>
      <button
        title="Novidades"
        aria-label={`Novidades${newReleases ? ' (tem coisa nova)' : ''}`}
        aria-current={releasesOpen ? 'true' : undefined}
        data-tour="releases"
        onClick={releasesOpen ? closeReleases : openReleases}
        className={cx(tile, releasesOpen ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg')}
      >
        <Newspaper size={20} />
        {newReleases && !releasesOpen && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-surface-2 bg-accent" />}
      </button>
      {!desktop && download && (
        <a
          href={download}
          title="Baixar o app para Windows (transmite áudio sem retorno de voz)"
          aria-label="Baixar o app para Windows"
          className={cx(tile, 'bg-surface-3 text-accent-2 hover:bg-surface-4')}
        >
          <Download size={20} />
        </a>
      )}
    </nav>
    <ServerDrawerPanel
      open={drawer}
      servers={rest}
      activeId={releasesOpen ? null : activeId}
      dragId={drag?.id ?? null}
      editing={editing}
      handle={handle}
      onOpen={(id) => {
        openServer(id);
        setDrawer(false);
      }}
      onPin={(id) => pinnedIds.length < RAIL_MAX && savePins([...pinnedIds, id])}
      onStopEditing={() => setEditing(false)}
    />
    <DrawerLine open={drawer} count={servers.length - pinned.length} onToggle={() => setDrawer(!drawer)} />
    {drag && dragged && <DragGhost server={dragged} x={drag.x} y={drag.y} />}
    </div>
  );
}
