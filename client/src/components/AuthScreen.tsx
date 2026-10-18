import { MonitorUp, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { InvitePreview } from '../lib/types';
import { useApp } from '../store/app';
import { Avatar, Button, Input } from './ui';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useApp();
  const pendingInvite = useApp((s) => s.pendingInvite);
  const [invite, setInvite] = useState<InvitePreview | null>(null);

  useEffect(() => {
    if (!pendingInvite) return;
    api.get<InvitePreview>(`/invites/${encodeURIComponent(pendingInvite)}`).then((p) => {
      setInvite(p);
      setMode('register');
    }, () => setInvite(null));
  }, [pendingInvite]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password, displayName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-accent/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 h-[520px] w-[520px] rounded-full bg-accent-2/20 blur-[120px]" />

      <div className="relative grid w-full max-w-4xl animate-pop-in overflow-hidden rounded-3xl border border-line bg-surface-2/80 shadow-2xl backdrop-blur-xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-accent/20 via-transparent to-accent-2/10 p-10 md:flex">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-10 w-10" />
            <span className="text-2xl font-extrabold tracking-tight">Concord</span>
          </div>
          <div className="space-y-6">
            <h1 className="text-4xl leading-tight font-extrabold">
              Transmita sua tela a <span className="text-brand">60 fps</span>, junto com quem importa.
            </h1>
            <ul className="space-y-3 text-sm text-fg-muted">
              <li className="flex items-center gap-3">
                <MonitorUp size={18} className="text-accent-2" /> Tela inteira, janela ou aba em até 4K
              </li>
              <li className="flex items-center gap-3">
                <Users size={18} className="text-accent-2" /> Servidores, salas de voz e chat em tempo real
              </li>
              <li className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-accent-2" /> Cargos e permissões no estilo Discord
              </li>
            </ul>
          </div>
          <p className="text-xs text-fg-subtle">Hospedado por você, sem limites de qualidade.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 p-8 md:p-10">
          {invite && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
              <Avatar name={invite.server.name} color={invite.server.iconColor} size={44} className="[&>div]:rounded-2xl" />
              <div className="min-w-0">
                <div className="text-xs text-fg-muted">Você foi convidado para</div>
                <div className="truncate font-bold">{invite.server.name}</div>
                <div className="text-xs text-fg-subtle">{invite.memberCount} membro(s) · entre ou crie sua conta para aceitar</div>
              </div>
            </div>
          )}
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{mode === 'login' ? 'Bem-vindo de volta!' : 'Criar uma conta'}</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {mode === 'login' ? 'Que bom te ver de novo.' : 'Leva menos de um minuto.'}
            </p>
          </div>
          <Input label="Usuário" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required />
          {mode === 'register' && (
            <Input label="Nome de exibição" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como os outros vão te ver" />
          )}
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={loading} className="h-11 w-full">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
          <p className="text-sm text-fg-muted">
            {mode === 'login' ? 'Precisa de uma conta? ' : 'Já tem uma conta? '}
            <button
              type="button"
              className="font-semibold text-accent-2 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
