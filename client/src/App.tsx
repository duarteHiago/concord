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

export default function App() {
  if (IS_DEV_WINDOW) return <DevWindow />;
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
    </>
  );
}

function Shell() {
  useEmailPrompt();
  const detail = useActiveDetail();
  const activeServerId = useApp((s) => s.activeServerId);
  const channelId = useApp((s) => (s.activeServerId ? s.activeChannels[s.activeServerId] : undefined));
  const memberListOpen = useApp((s) => s.memberListOpen);
  const channel = detail?.channels.find((c) => c.id === channelId);

  return (
    <div className="flex h-full gap-4 bg-surface-1 p-4">
      <ChannelSidebar />
      {activeServerId === HOME ? (
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
