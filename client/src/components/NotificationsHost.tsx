// Liga as notificações à tela: marca como lido o canal que está à vista, põe o número de menções no título da
// aba ("(3) Concord") e mostra a pilha de avisos.
import { useEffect } from 'react';
import { HOME, useApp } from '../store/app';
import { totalMentions, useUnreads } from '../store/unreads';
import { NoticeStack } from './NoticeStack';
import { PushPrompt } from './PushPrompt';
import { openNoticeTarget } from '../lib/notify';
import { takeOpenFromUrl, wirePush } from '../lib/push';

export function NotificationsHost() {
  const serverId = useApp((s) => s.activeServerId);
  const channelId = useApp((s) => (s.activeServerId && s.activeServerId !== HOME ? s.activeChannels[s.activeServerId] : undefined));
  const loaded = useUnreads((s) => s.loaded);

  // canal à vista com a janela em foco = lido. Vale ao trocar de canal e ao voltar para a janela.
  useEffect(() => {
    if (!channelId || serverId === HOME) return;
    const read = () => {
      if (document.hasFocus() && !document.hidden) useUnreads.getState().markRead(channelId);
    };
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [serverId, channelId, loaded]);

  // título da aba: menções de canal + mensagens diretas não lidas
  const mentions = useUnreads((s) => totalMentions(s.channels));
  const dms = useApp((s) => (s.dms ?? []).reduce((n, d) => n + d.unread, 0));
  useEffect(() => {
    const n = mentions + dms;
    // o prefixo do Concord de testes ("[TESTE] ") é recolocado por lib/staging.ts
    document.title = n > 0 ? `(${n > 99 ? '99+' : n}) Concord` : 'Concord';
  }, [mentions, dms]);

  // toque numa notificação push: com o app aberto chega por mensagem do service worker; fechado, vem no endereço
  const ready = useApp((s) => s.servers.length > 0);
  useEffect(() => wirePush(openNoticeTarget), []);
  useEffect(() => {
    if (!ready) return;
    const t = takeOpenFromUrl();
    if (t) openNoticeTarget(t);
  }, [ready]);

  return (
    <>
      <NoticeStack />
      <PushPrompt />
    </>
  );
}
