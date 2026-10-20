import { MonitorUp, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { InvitePreview } from '../lib/types';
import { useApp } from '../store/app';
import { ForgotByEmail, useEmailRecovery } from './EmailRecovery';
import { GoogleButton, GoogleSignupForm } from './GoogleLogin';
import { Avatar, Button, Input } from './ui';

type Mode = 'login' | 'register' | 'reset' | 'forgot';

const TITLES: Record<Mode, [string, string]> = {
  login: ['Bem-vindo de volta!', 'Que bom te ver de novo.'],
  register: ['Criar uma conta', 'Leva menos de um minuto.'],
  reset: ['Esqueci minha senha', 'Use o código de recuperação que você guardou ao criar a conta.'],
  forgot: ['Esqueci minha senha', 'Mandamos um link para o e-mail cadastrado na sua conta.'],
};

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, resetPassword } = useApp();

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setPassword('');
  };
  const pendingInvite = useApp((s) => s.pendingInvite);
  const googleSignup = useApp((s) => s.googleSignup);
  const emailOn = useEmailRecovery();
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
      else if (mode === 'register') await register(username, password, displayName);
      else await resetPassword(username, code, password);
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
          <img src="/brand/concord-logo.png" alt="Concord" className="h-11 w-auto self-start" />
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
          <p className="text-xs text-fg-subtle">
            Hospedado por você, sem limites de qualidade. ·{' '}
            <a href="/privacidade/" target="_blank" rel="noreferrer" className="hover:text-fg">
              Privacidade
            </a>{' '}
            ·{' '}
            <a href="/termos/" target="_blank" rel="noreferrer" className="hover:text-fg">
              Termos
            </a>
          </p>
        </div>

        {googleSignup ? (
          <GoogleSignupForm />
        ) : mode === 'forgot' ? (
          <div className="space-y-4 p-8 md:p-10">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">{TITLES.forgot[0]}</h2>
              <p className="mt-1 text-sm text-fg-muted">{TITLES.forgot[1]}</p>
            </div>
            <ForgotByEmail login={username} setLogin={setUsername} />
            <button type="button" onClick={() => switchMode('reset')} className="text-sm font-semibold text-fg-muted hover:text-accent">
              Não cadastrei e-mail: usar o código de recuperação
            </button>
            <p className="text-sm text-fg-muted">
              Lembrou a senha?{' '}
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => switchMode('login')}>
                Entrar
              </button>
            </p>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4 p-8 md:p-10">
          {invite && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
              <Avatar name={invite.server.name} color={invite.server.iconColor} src={invite.server.iconUrl} size={44} className="[&>*]:rounded-2xl" />
              <div className="min-w-0">
                <div className="text-xs text-fg-muted">Você foi convidado para</div>
                <div className="truncate font-bold">{invite.server.name}</div>
                <div className="text-xs text-fg-subtle">{invite.memberCount} membro(s) · entre ou crie sua conta para aceitar</div>
              </div>
            </div>
          )}
          <div className="mb-6">
            <h2 className="text-2xl font-bold">{TITLES[mode][0]}</h2>
            <p className="mt-1 text-sm text-fg-muted">{TITLES[mode][1]}</p>
          </div>
          <Input label="Usuário" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required />
          {mode === 'register' && (
            <Input label="Nome de exibição" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como os outros vão te ver" />
          )}
          {mode === 'reset' && (
            <Input
              label="Código de recuperação"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="one-time-code"
              className="font-mono tracking-wider uppercase"
              required
            />
          )}
          <Input
            label={mode === 'reset' ? 'Nova senha' : 'Senha'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode === 'login' ? undefined : 'Mínimo de 6 caracteres'}
            required
          />
          {mode === 'login' && (
            <button type="button" onClick={() => switchMode(emailOn ? 'forgot' : 'reset')} className="-mt-2 text-sm font-semibold text-fg-muted hover:text-accent">
              Esqueci minha senha
            </button>
          )}
          {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={loading} className="h-11 w-full">
            {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Redefinir senha'}
          </Button>
          {mode !== 'reset' && <GoogleButton />}
          {mode === 'reset' && emailOn && (
            <button type="button" onClick={() => switchMode('forgot')} className="text-sm font-semibold text-fg-muted hover:text-accent">
              Receber um link por e-mail
            </button>
          )}
          {mode === 'reset' && (
            <p className="text-xs text-fg-subtle">
              Sem código e sem e-mail cadastrado? Fale com quem administra o Concord.
            </p>
          )}
          {mode === 'register' && (
            <p className="text-xs text-fg-subtle">
              Ao criar a conta você concorda com os{' '}
              <a href="/termos/" target="_blank" rel="noreferrer" className="underline hover:text-fg">
                Termos
              </a>{' '}
              e a{' '}
              <a href="/privacidade/" target="_blank" rel="noreferrer" className="underline hover:text-fg">
                Política de Privacidade
              </a>
              .
            </p>
          )}
          <p className="text-sm text-fg-muted">
            {mode === 'login' ? 'Precisa de uma conta? ' : mode === 'register' ? 'Já tem uma conta? ' : 'Lembrou a senha? '}
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
