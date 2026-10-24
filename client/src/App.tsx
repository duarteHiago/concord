import { lazy, Suspense, useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { EmailResetScreen, useEmailPrompt } from './components/EmailRecovery';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatView } from './components/ChatView';
import { DevWindow } from './components/DevWindow';
import { ForumView } from './components/ForumView';
import { MemberList } from './components/MemberList';
import { ModalHost } from './components/modals/ModalHost';
import { Spinner, Toasts } from './components/ui';
import { UpdateBanner } from './components/UpdateBanner';
import { NudgeCard } from './components/NudgeCard';
import { GameOverlay } from './components/GameOverlay';
import { ClipToast } from './components/Clip';
import { RecordingPill } from './components/RecordControls';
import { PatchInspectorHost } from './components/PatchInspector';
import { ReleasesView } from './components/ReleasesView';
import { SpotlightHost } from './components/Spotlight';
import { useMecenasReveal } from './components/Mecenas';
import { useWhatsNewPrompt } from './components/modals/WhatsNewModal';
import { DropClaimModal, DropPage, useClaimAfterLogin, useDrop } from './components/PatchDrop';
import { VoiceView } from './components/VoiceView';
import { WelcomeView } from './components/WelcomeView';
import { HOME, useActiveDetail, useApp } from './store/app';
import { DmView } from './components/DirectMessages';
import { useDevStatsPublisher } from './lib/devStats';
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

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <>
      {emailReset ? <EmailResetScreen /> : dropStage === 'page' ? <DropPage /> : me ? <Shell /> : <AuthScreen />}
      {me && dropStage === 'claim' && <DropClaimModal />}
      <ModalHost />
      <Toasts />
      <UpdateBanner />
      {me && <NudgeCard />}
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
  const releasesOpen = useApp((s) => s.releasesOpen);
  const detail = useActiveDetail();
  const activeServerId = useApp((s) => s.activeServerId);
  const channelId = useApp((s) => (s.activeServerId ? s.activeChannels[s.activeServerId] : undefined));
  const memberListOpen = useApp((s) => s.memberListOpen);
  const channel = detail?.channels.find((c) => c.id === channelId);

  return (
    <div className="flex h-full gap-4 bg-surface-1 p-4">
      <ChannelSidebar />
      {releasesOpen ? (
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
            {memberListOpen && channel && <MemberList />}
          </>
        )
      ) : (
        <WelcomeView />
      )}
    </div>
  );
}
