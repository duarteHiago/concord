import { useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Input, Modal } from '../ui';

/** Banir do servidor: a pessoa sai e não volta nem com convite, até alguém desbanir (aba Banidos). */
export function BanModal({ serverId, userId, name, then }: { serverId: string; userId: string; name: string; then?: () => void }) {
  const close = useApp((s) => s.closeModal);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function ban() {
    setLoading(true);
    try {
      await api.post(`/servers/${serverId}/bans`, { userId, reason: reason.trim() || undefined });
      toast.success(`${name} foi banido`);
      close();
      then?.();
    } catch (err) {
      toast.error(err);
      setLoading(false);
    }
  }

  return (
    <Modal
      title={`Banir ${name}`}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" loading={loading} onClick={() => void ban()}>
            Banir
          </Button>
        </>
      }
    >
      <p className="mb-4 text-fg-muted">
        {name} sai do servidor e não consegue voltar, nem com convite. Dá para desbanir depois em Configurações do servidor → Banidos.
      </p>
      <Input
        label="Motivo (opcional)"
        hint="Só quem pode banir vê."
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void ban()}
        autoFocus
      />
    </Modal>
  );
}
