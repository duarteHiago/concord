// "Descobrir": servidores públicos, que qualquer pessoa entra sem convite (quem gerencia liga nas configurações).
import { Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ServerSummary } from '../../lib/types';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Avatar, Button, Modal, Spinner, VerifiedBadge } from '../ui';

interface PublicServer extends ServerSummary {
  memberCount: number;
  onlineCount: number;
  joined: boolean;
}

export function DiscoverModal() {
  const close = useApp((s) => s.closeModal);
  const [q, setQ] = useState('');
  const [list, setList] = useState<PublicServer[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<PublicServer[]>(`/discover${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setList, (e) => {
        toast.error(e);
        setList([]);
      });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const enter = async (s: PublicServer) => {
    if (s.joined) {
      close();
      useApp.getState().openServer(s.id);
      return;
    }
    setJoining(s.id);
    try {
      await api.post(`/servers/${s.id}/join`);
      await useApp.getState().loadServers();
      close();
      useApp.getState().openServer(s.id);
      toast.success(`Você entrou em ${s.name}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setJoining(null);
    }
  };

  return (
    <Modal title="Descobrir servidores" subtitle="Servidores públicos: entre sem precisar de convite." onClose={close} width={560}>
      <label className="mb-3 flex h-10 items-center gap-2 rounded-xl bg-surface-3 px-3">
        <Search size={16} className="text-fg-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome ou assunto" className="min-w-0 flex-1 bg-transparent text-sm outline-none" maxLength={50} />
      </label>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {!list ? (
          <div className="grid h-32 place-items-center">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{q ? 'Nenhum servidor público com esse nome.' : 'Ainda não tem servidor público. Quem gerencia um servidor pode abrir ele em Configurações do servidor.'}</p>
        ) : (
          list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface-3 p-3">
              <Avatar name={s.name} color={s.iconColor} src={s.iconUrl} size={48} className="[&>*]:rounded-2xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{s.name}</span>
                  {s.verified && <VerifiedBadge size={14} className="shrink-0" />}
                </div>
                {s.description && <p className="line-clamp-2 text-xs text-fg-muted">{s.description}</p>}
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-ok" /> {s.onlineCount} online
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {s.memberCount} {s.memberCount === 1 ? 'membro' : 'membros'}
                  </span>
                </div>
              </div>
              <Button variant={s.joined ? 'secondary' : 'primary'} className="h-9 shrink-0 px-4" loading={joining === s.id} onClick={() => void enter(s)}>
                {s.joined ? 'Abrir' : 'Entrar'}
              </Button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
