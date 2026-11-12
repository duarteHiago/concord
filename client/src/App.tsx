import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { EmailGateScreen, EmailResetScreen, useEmailPrompt } from './components/EmailRecovery';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatView } from './components/ChatView';
import { DevWindow } from './components/DevWindow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ForumView } from './components/ForumView';
import { MemberList } from './components/MemberList';
import { ModalHost } from './components/modals/ModalHost';
import { RecordDialog } from './components/RecordDialog';
import { Spinner, Toasts, cx } from './components/ui';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { NudgeCard, NudgeMessageToast } from './components/NudgeCard';
import { GameOverlay } from './components/GameOverlay';
import { ClipToast } from './components/Clip';
import { RecordingPill } from './components/RecordControls';
import { PatchInspectorHost } from './components/PatchInspector';
import { ReleasesView } from './components/ReleasesView';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/settings/SettingsPage';
import { SpotlightHost } from './components/Spotlight';
import { useMecenasReveal } from './components/Mecenas';
import { useContractRenewal } from './components/Mecenato';
import { useWhatsNewPrompt } from './components/modals/WhatsNewModal';
import { DropClaimModal, DropPage, useClaimAfterLogin, useDrop } from './components/PatchDrop';
import { VoiceView } from './components/VoiceView';
import { WelcomeView } from './components/WelcomeView';
import { HOME, needsEmail, useActiveDetail, useApp } from './store/app';
import { DmView } from './components/DirectMessages';
import { MobileBottomNav } from './components/MobileNav';
import { useMobile } from './lib/mobile';
import { useDevStatsPublisher } from './lib/devStats';
import { DeckScreen } from './components/Deck';
import { DirectorRemote, DirectorWindowHost } from './components/Director';
import { setMotionPref } from './lib/motion';
import { useVoice } from './store/voice';
import './lib/visibility';

const PATH = location.pathname.replace(/\/+$/, '');
/** /diagnostico abre como janela/aba independente — ver lib/desktop.ts e lib/devStats.ts. */
const IS_DEV_WINDOW = PATH === '/diagnostico';
/** /compatibilidade: página pública (sem login) sobre H.265 — ver components/CompatibilityPage.tsx. */
const IS_COMPATIBILITY = PATH === '/compatibilidade';
const CompatibilityPage = lazy(() => import('./components/CompatibilityPage'));
/** /admin: portal da equipe (só quem está em ADMIN_USERS no servidor) — ver components/admin/. */
const IS_ADMIN = PATH === '/admin';
const AdminPortal = lazy(() => import('./components/admin/AdminPortal'));

export default function App() {
  if (IS_DEV_WINDOW) return <DevWindow />;
  if (IS_ADMIN) {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size={36} /></div>}>
        <AdminPortal />
      </Suspense>
    );
  }
  if (IS_COMPATIBILITY) {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner size={36} /></div>}>
        <CompatibilityPage />
      </Suspense>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const ready = useApp((s) => s.ready);
  const me = useApp((s) => s.me);
  const motion = me?.settings.motion;
  useEffect(() => setMotionPref(motion), [motion]);
  const bootstrap = useApp((s) => s.bootstrap);
  const dropStage = useDrop((s) => s.stage);
  const emailReset = useApp((s) => s.emailReset);
  // link do controle remoto da direção (/?direcao=SALA&servidor=SERVIDOR), lido uma vez na abertura
  const [remote] = useState(() => {
    const q = new URLSearchParams(location.search);
    const channelId = q.get('direcao');
    const serverId = q.get('servidor');
    return channelId && serverId ? { channelId, serverId } : null;
  });
  const room = useVoice((s) => s.room);
  useClaimAfterLogin();
  useDevStatsPublisher(me ? room : null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // veio do botão "Apoiar" da landing: abre a janela do Pix assim que a pessoa estiver logada
  // (a marca fica também no localStorage, porque o login com Google volta sem a query)
  const openModal = useApp((s) => s.openModal);
  useEffect(() => {
    if (!me) return;
    let flagged = false;
    try {
      flagged = localStorage.getItem('concord.openSupport') === '1';
      localStorage.removeItem('concord.openSupport');
    } catch {
      // ignorado
    }
    const q = new URLSearchParams(location.search);
    if (!flagged && !q.has('apoiar')) return;
    q.delete('apoiar');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    openModal({ type: 'support' });
  }, [me, openModal]);

  // veio da seção de Mecenato da landing: abre a aba dos contratos depois do login (mesma ideia do apoio)
  const openSettings = useApp((s) => s.openSettings);
  useEffect(() => {
    if (!me) return;
    let flagged = false;
    try {
      flagged = localStorage.getItem('concord.openMecenato') === '1';
      localStorage.removeItem('concord.openMecenato');
    } catch {
      // ignorado
    }
    const q = new URLSearchParams(location.search);
    if (!flagged && !q.has('mecenato')) return;
    q.delete('mecenato');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    openSettings('mecenato');
  }, [me, openSettings]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <>
      {emailReset ? (
        <EmailResetScreen />
      ) : dropStage === 'page' ? (
        <DropPage />
      ) : me ? (
        needsEmail(me) ? (
          <EmailGateScreen />
        ) : remote ? (
          // controle remoto da direção (celular): só o painel, sem entrar na call
          <DirectorRemote serverId={remote.serverId} channelId={remote.channelId} />
        ) : (
          <Shell />
        )
      ) : (
        <AuthScreen />
      )}
      {me && dropStage === 'claim' && <DropClaimModal />}
      <ModalHost />
      {me && <RecordDialog />}
      <Toasts />
      <UpdateBanner />
      <PwaUpdateBanner />
      {me && <NudgeCard />}
      {me && <DirectorWindowHost />}
      {me && !remote && <DeckScreen />}
      {me && <NudgeMessageToast />}
      {me && <GameOverlay />}
      {me && <ClipToast />}
      {me && <RecordingPill />}
      {me && <PatchInspectorHost />}
      {me && <SpotlightHost />}
    </>
  );
}

function Shell() {
  useEmailPrompt();
  useWhatsNewPrompt();
  useMecenasReveal();
  useContractRenewal();
  const mobile = useMobile();
  const mobileView = useApp((s) => s.mobileView);
  const releasesOpen = useApp((s) => s.releasesOpen);
  const profileOpen = useApp((s) => !!s.profile);
  const settingsOpen = useApp((s) => !!s.settings);
  const detail = useActiveDetail();
  const activeServerId = useApp((s) => s.activeServerId);
  const channelId = useApp((s) => (s.activeServerId ? s.activeChannels[s.activeServerId] : undefined));
  const memberListOpen = useApp((s) => s.memberListOpen);
  const channel = detail?.channels.find((c) => c.id === channelId);
  const view = `${settingsOpen ? 'config' : profileOpen ? 'perfil' : releasesOpen ? 'novidades' : ''}|${activeServerId}|${channelId}`;

  const showSidebar = !mobile || mobileView === 'sidebar';
  const showContent = !mobile || mobileView === 'chat';

  const content = (
    <ErrorBoundary area="painel" resetKey={view}>
      {settingsOpen ? (
        <SettingsPage />
      ) : profileOpen ? (
        <ProfilePage />
      ) : releasesOpen ? (
        <ReleasesView />
      ) : activeServerId === HOME ? (
        <DmView />
      ) : activeServerId ? (
        channel?.type === 'voice' ? (
          <VoiceView channel={channel} />
        ) : (
          <>
            <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
              {channel?.type === 'forum' ? (
                <ForumView channel={channel} />
              ) : channel ? (
                <ChatView channel={channel} />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner />
                </div>
              )}
            </main>
            {memberListOpen && channel && !mobile && <MemberList />}
          </>
        )
      ) : (
        <WelcomeView />
      )}
    </ErrorBoundary>
  );

  return (
    <div className={cx('flex h-full flex-col bg-surface-1', !mobile && 'p-4')}>
      <div className={cx('flex min-h-0 flex-1', !mobile && 'gap-4')}>
        {showSidebar && <ChannelSidebar />}
        {showContent && content}
      </div>
      <MobileBottomNav />
    </div>
  );
}
