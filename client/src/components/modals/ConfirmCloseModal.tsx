// "Fechar o Concord?": aparece ao fechar o app desktop no meio de uma call ou da Praça (ver lib/closeGuard.ts).
import { useState } from 'react';
import { closeNow, setCloseAsk } from '../../lib/closeGuard';
import { useApp } from '../../store/app';
import { Button, Modal } from '../ui';

export function ConfirmCloseModal({ reason }: { reason: string }) {
  const close = useApp((s) => s.closeModal);
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <Modal
      title="Fechar o Concord?"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} autoFocus>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (dontAsk) setCloseAsk(false);
              close();
              closeNow();
            }}
          >
            Fechar o Concord
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">{reason} Fechando o app, você sai dela.</p>
      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm select-none">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
        Não perguntar novamente
      </label>
      <p className="mt-1 pl-6.5 text-xs text-fg-subtle">Dá para voltar a perguntar em Configurações → Conta e segurança → App desktop.</p>
    </Modal>
  );
}
