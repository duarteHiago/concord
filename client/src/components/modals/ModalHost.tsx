import { useEffect, useState } from 'react';
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
    case 'recoveryCode':
      return <RecoveryCodeModal {...modal} />;
    case 'image':
      return <ImageViewer src={modal.src} alt={modal.alt} />;
  }
}

/** Foto ou capa em tamanho grande (clique fora ou Esc fecha). */
function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const close = useApp((s) => s.closeModal);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div role="dialog" aria-label={alt} onClick={close} className="fixed inset-0 z-[60] flex animate-fade-in flex-col items-center justify-center gap-4 bg-black/85 p-8 backdrop-blur-sm">
      <img src={src} alt={alt} className="max-h-[80vh] max-w-[90vw] animate-pop-in rounded-[24px] object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={src} target="_blank" rel="noreferrer noopener" className="flex h-10 items-center rounded-full bg-surface-3 px-5 font-display text-sm font-bold hover:bg-surface-4">
          Abrir original
        </a>
        <button onClick={close} className="h-10 rounded-full bg-surface-3 px-5 font-display text-sm font-bold hover:bg-surface-4">
          Fechar
        </button>
      </div>
    </div>
  );
}

function RecoveryCodeModal({ code, next, afterReset }: Extract<ModalState, { type: 'recoveryCode' }>) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = useApp((s) => s.me);
  const finish = () => {
    useApp.setState({ modal: next ?? null, me: me ? { ...me, hasRecoveryCode: true } : me });
  };

  function download() {
    const text = `Código de recuperação do Concord\nConta: @${me?.username}\nSite: ${location.origin}\n\n${code}\n\nUse em "Esqueci minha senha" na tela de login. Depois de usado, um novo código é gerado.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `concord-recuperacao-${me?.username ?? 'conta'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <Modal
      title={afterReset ? 'Senha redefinida!' : 'Guarde seu código de recuperação'}
      subtitle={
        afterReset
          ? 'O código antigo deixou de valer. Este é o seu novo código de recuperação:'
          : 'Se você esquecer a senha, é com ele que você entra de novo. Ele só aparece agora.'
      }
      onClose={() => saved && finish()}
      footer={
        <Button disabled={!saved} onClick={finish}>
          Já guardei, continuar
        </Button>
      }
    >
      <div className="rounded-2xl bg-surface-0 p-5 text-center font-mono text-2xl font-bold tracking-widest select-all">{code}</div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setSaved(true);
            } catch {
              toast.error('Não foi possível copiar. Selecione o código e copie manualmente.');
            }
          }}
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={download}>
          Baixar .txt
        </Button>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
        Guardei o código num lugar seguro
      </label>
    </Modal>
  );
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
