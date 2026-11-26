// As telas que abrem por cima no app (perfil, configurações, Novidades e, no celular, a conversa aberta por cima da
// lista de canais) entram na pilha do "voltar" (ver lib/backStack.ts): o botão/gesto voltar do celular fecha a de
// cima em vez de sair do app. Os modais, menus e a gaveta de servidores registram a própria camada.
import { useBackHandler } from '../lib/backStack';
import { useMobile } from '../lib/mobile';
import { useApp } from '../store/app';
import { SwipeBack } from './SwipeBack';

export function BackLayers() {
  const mobile = useMobile();
  const profile = useApp((s) => !!s.profile);
  const settings = useApp((s) => !!s.settings);
  const releases = useApp((s) => s.releasesOpen);
  const chat = useApp((s) => s.mobileView === 'chat');

  useBackHandler(profile, () => useApp.getState().closeProfile());
  useBackHandler(settings, () => useApp.getState().closeSettings());
  useBackHandler(releases, () => useApp.getState().closeReleases());
  // celular: a conversa aberta cobre a lista de canais; voltar mostra a lista (como a seta do topo)
  useBackHandler(mobile && chat && !profile && !settings && !releases, () => useApp.getState().setMobileView('sidebar'));

  return <SwipeBack />;
}
