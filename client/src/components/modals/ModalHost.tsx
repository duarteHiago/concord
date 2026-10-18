import { useState } from 'react';
import { useApp, type Modal as ModalState } from '../../store/app';
import { toast } from '../../store/toast';
import { MemberPopover } from '../MemberPopover';
import { Button, Modal } from '../ui';
import { AddServerModal } from './AddServerModal';
import { ChannelSettingsModal, CreateChannelModal } from './ChannelModals';
import { InviteModal } from './InviteModal';
import { ServerSettingsModal } from './ServerSettingsModal';
import { ShareScreenModal } from './ShareScreenModal';
import { UserSettingsModal } from './UserSettingsModal';

export function ModalHost() {
  const modal = useApp((s) => s.modal);
  const me = useApp((s) => s.me);
  return (
    <>
      {me && <MemberPopover />}
      {me && modal && <ModalSwitch modal={modal} />}
    </>
  );
}

function ModalSwitch({ modal }: { modal: ModalState }) {
  switch (modal.type) {
    case 'addServer':
      return <AddServerModal initialTab={modal.tab} code={modal.code} />;
    case 'invite':
      return <InviteModal serverId={modal.serverId} />;
    case 'serverSettings':
      return <ServerSettingsModal serverId={modal.serverId} initialTab={modal.tab} />;
    case 'createChannel':
      return <CreateChannelModal serverId={modal.serverId} kind={modal.kind} />;
    case 'channelSettings':
      return <ChannelSettingsModal serverId={modal.serverId} channelId={modal.channelId} />;
    case 'userSettings':
      return <UserSettingsModal />;
    case 'shareScreen':
      return <ShareScreenModal />;
    case 'confirm':
      return <ConfirmModal {...modal} />;
  }
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm }: Extract<ModalState, { type: 'confirm' }>) {
  const close = useApp((s) => s.closeModal);
  const [loading, setLoading] = useState(false);
  return (
    <Modal
      title={title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
                close();
              } catch (err) {
                toast.error(err);
                setLoading(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">{message}</p>
    </Modal>
  );
}
