import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Invite } from '../../lib/types';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Modal } from '../ui';

const EXPIRY = [
  { label: '30 minutos', value: 1800 },
  { label: '1 dia', value: 86400 },
  { label: '7 dias', value: 604800 },
  { label: 'Nunca', value: 0 },
];

export function InviteModal({ serverId }: { serverId: string }) {
  const close = useApp((s) => s.closeModal);
  const server = useApp((s) => s.details[serverId]?.server);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [expiresIn, setExpiresIn] = useState(604800);
  const [maxUses, setMaxUses] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.post<Invite>(`/servers/${serverId}/invites`, { expiresIn, maxUses }).then(setInvite).catch(toast.error);
  }, [serverId, expiresIn, maxUses]);

  const link = invite ? `${location.origin}/invite/${invite.code}` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o link manualmente.');
    }
  }

  return (
    <Modal title={`Convidar amigos para ${server?.name ?? ''}`} subtitle="Envie este link para quem você quer chamar." onClose={close}>
      <div className="flex gap-2 rounded-xl border border-line bg-surface-0 p-1.5">
        <input readOnly value={link} className="flex-1 bg-transparent px-2 text-sm outline-none" onFocus={(e) => e.target.select()} />
        <Button onClick={copy} disabled={!invite} className="h-9" variant={copied ? 'secondary' : 'primary'}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Expira em</span>
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-line bg-surface-0 px-2 text-sm outline-none"
          >
            {EXPIRY.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Máximo de usos</span>
          <select
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-line bg-surface-0 px-2 text-sm outline-none"
          >
            {[0, 1, 5, 10, 25, 100].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Sem limite' : `${n} uso(s)`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
