// Tela do servidor montada na Oficina: a grade livre de 12×12 com os blocos do sistema e widgets. A barra de
// servidores fica fixa em cima (é por ela que a pessoa sai do servidor). Vale só em tela larga, fora das
// telas do sistema (configurações, perfil, Novidades), e cada membro pode voltar ao layout padrão.
import { useEffect, useState, type ReactNode } from 'react';
import { SCREEN_COLS, SCREEN_ROWS, isBlock, type ScreenItem } from '../../../shared/workshop.ts';
import { ChannelsBlock, VoiceUserBlock } from '../components/ChannelSidebar';
import { MemberListBody } from '../components/MemberList';
import { ServerStrip } from '../components/ServerRail';
import { HOME, useApp } from '../store/app';
import { WidgetCard } from './Card';
import { WORKSHOP_ENABLED, useActiveConfig, workshopPrefs } from './store';
import type { ThemeScope } from './theme';
import { WidgetBody } from './widgets';

/** Largura mínima para a tela montada (abaixo disso, o layout padrão, que já se adapta). */
const MIN_WIDTH = 1100;

function useWide() {
  const query = `(min-width: ${MIN_WIDTH}px)`;
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

/** Os itens da tela montada, se ela vale agora; senão null (fica o layout padrão). */
export function useServerScreen(): ScreenItem[] | null {
  const serverId = useApp((s) => s.activeServerId);
  const systemOpen = useApp((s) => s.releasesOpen || !!s.profile || !!s.settings);
  useApp((s) => s.me?.settings); // preferências
  const config = useActiveConfig(serverId && serverId !== HOME ? serverId : null);
  const wide = useWide();
  if (!WORKSHOP_ENABLED || !wide || systemOpen || !config?.screen) return null;
  if (!workshopPrefs().layouts) return null;
  return config.screen.items;
}

export function ServerScreen({ items, main, theme }: { items: ScreenItem[]; main: ReactNode; theme: ThemeScope | null }) {
  const serverId = useApp((s) => s.activeServerId)!;
  const detail = useApp((s) => s.details[serverId]);
  return (
    <div className="flex h-full flex-col gap-4 bg-surface-1 p-4" style={theme?.style} data-ws-shape={theme?.shape}>
      <div className="panel shrink-0">
        <ServerStrip />
      </div>
      <div
        className="grid min-h-0 flex-1 gap-4"
        style={{
          gridTemplateColumns: `repeat(${SCREEN_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${SCREEN_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {items.map((it) => (
          <div key={it.id} className="flex min-h-0 min-w-0" style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}>
            {isBlock(it) ? (
              it.block === 'main' ? (
                main
              ) : it.block === 'channels' ? (
                <aside className="panel flex min-w-0 flex-1 flex-col overflow-hidden">{detail && <ChannelsBlock detail={detail} />}</aside>
              ) : it.block === 'members' ? (
                <aside aria-label="Membros" className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
                  <MemberListBody />
                </aside>
              ) : (
                <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
                  <VoiceUserBlock />
                </div>
              )
            ) : (
              // os widgets da tela seguem o tema (do servidor ou o da pessoa), como os blocos ao lado
              <WidgetCard ctx={{ serverId, pack: null }} className="flex-1">
                <WidgetBody w={it} ctx={{ serverId, pack: null }} />
              </WidgetCard>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
