import { useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatView } from './components/ChatView';
import { MemberList } from './components/MemberList';
import { ModalHost } from './components/modals/ModalHost';
import { Spinner, Toasts } from './components/ui';
import { UpdateBanner } from './components/UpdateBanner';
import { NudgeCard } from './components/NudgeCard';
import { VoiceView } from './components/VoiceView';
import { WelcomeView } from './components/WelcomeView';
import { HOME, useActiveDetail, useApp } from './store/app';
import { DmView } from './components/DirectMessages';

export default function App() {
  const ready = useApp((s) => s.ready);
  const me = useApp((s) => s.me);
  const bootstrap = useApp((s) => s.bootstrap);

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
      {me ? <Shell /> : <AuthScreen />}
      <ModalHost />
      <Toasts />
      <UpdateBanner />
      {me && <NudgeCard />}
    </>
  );
}

function Shell() {
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
              {channel ? (
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
