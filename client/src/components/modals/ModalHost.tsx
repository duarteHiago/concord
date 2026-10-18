import { useState } from 'react';
import { useApp, type Modal as ModalState } from '../../store/app';
import { toast } from '../../store/toast';
import { MemberPopover } from '../MemberPopover';
import { api } from '../../lib/api';
import { Button, Input, Modal } from '../ui';
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
    case 'nickname':
      return <NicknameModal serverId={modal.serverId} userId={modal.userId} />;
  }
}

function NicknameModal({ serverId, userId }: { serverId: string; userId: string }) {
  const close = useApp((s) => s.closeModal);
  const me = useApp((s) => s.me)!;
  const member = useApp((s) => s.details[serverId]?.members.find((m) => m.id === userId));
  const server = useApp((s) => s.details[serverId]?.server);
  const [value, setValue] = useState(member?.nickname ?? '');
  const [loading, setLoading] = useState(false);
  if (!member) return null;
  const self = userId === me.id;

  async function save(nickname: string | null) {
    setLoading(true);
    try {
      await api.put(`/servers/${serverId}/members/${self ? '@me' : userId}/nickname`, { nickname });
      close();
    } catch (err) {
      toast.error(err);
      setLoading(false);
    }
  }

  return (
    <Modal
      title={self ? 'Meu apelido neste servidor' : `Apelido de ${member.displayName}`}
      subtitle={`Vale só em ${server?.name ?? 'este servidor'}. O nome de exibição continua "${member.displayName}" nos outros.`}
      onClose={close}
      footer={
        <>
          {member.nickname && (
            <Button variant="ghost" onClick={() => void save(null)} disabled={loading}>
              Remover apelido
            </Button>
          )}
          <Button loading={loading} onClick={() => void save(value.trim() || null)}>
            Salvar
          </Button>
        </>
      }
    >
      <Input
        label="Apelido"
        value={value}
        maxLength={32}
        autoFocus
        placeholder={member.displayName}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void save(value.trim() || null)}
      />
    </Modal>
  );
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
