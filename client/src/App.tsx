import { useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatView } from './components/ChatView';
import { MemberList } from './components/MemberList';
import { ModalHost } from './components/modals/ModalHost';
import { ServerRail } from './components/ServerRail';
import { Spinner, Toasts } from './components/ui';
import { VoiceView } from './components/VoiceView';
import { WelcomeView } from './components/WelcomeView';
import { useActiveDetail, useApp } from './store/app';

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
    <div className="flex h-full">
      <ServerRail />
      {activeServerId ? (
        <>
          <ChannelSidebar />
          <main className="flex min-w-0 flex-1 flex-col bg-surface-2">
            {channel?.type === 'voice' ? (
              <VoiceView channel={channel} />
            ) : channel ? (
              <ChatView channel={channel} />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            )}
          </main>
          {memberListOpen && channel?.type === 'text' && <MemberList />}
        </>
      ) : (
        <WelcomeView />
      )}
    </div>
  );
}
