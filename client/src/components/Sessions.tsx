// Configurações > Conta > Aparelhos conectados: cada login é uma sessão; dá para tirar um aparelho da conta
// ou sair de todos os outros de uma vez.
import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, setToken } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Button, Spinner } from './ui';

interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: number;
  lastSeenAt: number;
  userAgent: string | null;
}

/** "App do Concord · Windows", "Chrome · Android"... a partir do navegador que a sessão usou. */
export function deviceLabel(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Aparelho desconhecido', mobile: false };
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const app = /Electron\//.test(ua)
    ? 'App do Concord'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  return { label: os ? `${app} · ${os}` : app, mobile: /iPhone|iPad|Android|Mobile/.test(ua) };
}

function lastSeen(s: SessionInfo): string {
  if (s.current) return 'Este aparelho';
  const min = Math.floor((Date.now() - s.lastSeenAt) / 60_000);
  if (min < 10) return 'Ativo agora';
  if (min < 60) return `Ativo há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Ativo há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Ativo ontem' : `Ativo há ${d} dias`;
}

export function SessionsSection() {
  const [data, setData] = useState<{ sessions: SessionInfo[]; currentListed: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => void api.get<{ sessions: SessionInfo[]; currentListed: boolean }>('/me/sessions').then(setData, toast.error);
  useEffect(load, []);

  async function remove(s: SessionInfo) {
    setBusy(s.id);
    try {
      await api.del(`/me/sessions/${s.id}`);
      toast.success(`${deviceLabel(s.userAgent).label} saiu da conta.`);
      load();
    } catch (err) {
      toast.error(err);
    }
    setBusy(null);
  }

  function logoutOthers() {
    useApp.getState().openModal({
      type: 'confirm',
      title: 'Sair de todos os outros aparelhos?',
      message: 'Todos os outros navegadores e apps conectados na sua conta vão precisar entrar de novo. Este aparelho continua conectado.',
      confirmLabel: 'Sair dos outros',
      danger: true,
      onConfirm: async () => {
        // o servidor devolve um token novo para este aparelho (os antigos deixam de valer)
        const { token } = await api.post<{ token: string }>('/me/sessions/logout-others', { socketId: getSocket()?.id });
        setToken(token);
        toast.success('Os outros aparelhos saíram da conta.');
        load();
      },
    });
  }


  return (
    <div className="space-y-3 rounded-2xl bg-surface-0 p-4">
      <div>
        <h3 className="font-semibold">Aparelhos conectados</h3>
        <p className="text-sm text-fg-muted">Onde a sua conta está aberta. Se não reconhecer algum, tire ele da conta e troque a senha.</p>
      </div>
      {!data ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {data.sessions.map((s) => {
            const { label, mobile } = deviceLabel(s.userAgent);
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3">
                  <Icon size={18} className={s.current ? 'text-accent' : 'text-fg-muted'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{label}</span>
                  <span className={s.current ? 'text-xs font-semibold text-accent' : 'text-xs text-fg-muted'}>
                    {lastSeen(s)} · entrou em {new Date(s.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                {!s.current && (
                  <Button variant="secondary" className="h-9 shrink-0 px-4 text-xs" loading={busy === s.id} onClick={() => void remove(s)}>
                    Sair
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && (
        // aparelhos conectados antes da lista existir só aparecem quando abrem o Concord de novo; o botão tira todos
        <p className="text-xs text-fg-subtle">
          Não achou algum aparelho? Os que estão conectados desde antes de 10 de novembro aparecem aqui quando abrirem o Concord de novo. Para tirar todos de uma vez, use o botão abaixo.
        </p>
      )}
      {data && (
        <Button variant="danger" onClick={logoutOthers}>
          Sair de todos os outros aparelhos
        </Button>
      )}
    </div>
  );
}
