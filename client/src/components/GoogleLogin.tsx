// Login com Google. No navegador é um redirecionamento normal. No app desktop o Google não deixa
// entrar dentro do Electron, então o login abre no navegador padrão e o app busca o resultado
// por um código de uso único (handoff).
import { Check, Link2, Unlink } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { desktop } from '../lib/desktop';
import type { Me } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Button, Input } from './ui';

// só o "sim" fica guardado: se o Google for ligado com o app aberto, a próxima tela já pergunta de novo
let googleOn = false;
export function useGoogleEnabled() {
  const [on, setOn] = useState(googleOn);
  useEffect(() => {
    if (googleOn) return;
    api.get<{ googleLogin?: boolean }>('/config').then((c) => {
      googleOn = !!c.googleLogin;
      setOn(googleOn);
    }, () => {});
  }, []);
  return on;
}

type HandoffResult = { token: string } | { mfa: string } | { signup: string } | { linked: true } | { error: string };

const newHandoffId = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Abre o login no navegador padrão e espera o resultado (até 10 min). */
function useDesktopHandoff(onResult: (r: HandoffResult) => void) {
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setWaiting(false);
  };
  useEffect(() => stop, []);

  function start(extra = '') {
    const id = newHandoffId();
    // links externos (http/https) abrem no navegador padrão pelo app desktop
    window.open(`${location.origin}/api/auth/google/start?handoff=${id}${extra}`, '_blank');
    setWaiting(true);
    const until = Date.now() + 10 * 60_000;
    timer.current = window.setInterval(async () => {
      if (Date.now() > until) return stop();
      try {
        const r = await api.get<HandoffResult | undefined>(`/auth/handoff/${id}`);
        if (r) {
          stop();
          onResult(r);
        }
      } catch {
        // ainda não chegou (ou rede oscilou): tenta de novo
      }
    }, 2000);
  }
  return { waiting, start, cancel: stop };
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Botão "Entrar com Google" da tela de login (só aparece se o servidor tiver o Google configurado). */
export function GoogleButton() {
  const enabled = useGoogleEnabled();
  const loginWithToken = useApp((s) => s.loginWithToken);
  const [error, setError] = useState('');
  const { waiting, start, cancel } = useDesktopHandoff((r) => {
    if ('token' in r) void loginWithToken(r.token).catch((e) => setError((e as Error).message));
    else if ('mfa' in r) useApp.setState({ mfaTicket: r.mfa });
    else if ('signup' in r) useApp.setState({ googleSignup: r.signup });
    else if ('error' in r) setError(r.error);
  });
  if (!enabled) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-fg-subtle">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      {waiting ? (
        <div className="rounded-2xl bg-surface-3 p-3 text-center text-sm text-fg-muted">
          Continue no navegador que abriu. Assim que você entrar, o app continua sozinho.
          <button type="button" onClick={cancel} className="mt-1 block w-full text-xs font-semibold text-fg-subtle hover:text-fg">
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError('');
            if (desktop) start();
            else location.href = '/api/auth/google/start';
          }}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-full bg-white font-display text-sm font-bold text-[#1f1f1f] transition-colors hover:bg-[#f1f1f1]"
        >
          <GoogleLogo /> Entrar com Google
        </button>
      )}
      {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Conta Google que ainda não está em nenhuma conta do Concord. Antes de criar uma conta nova,
 * pergunta se a pessoa já tem conta: aí ela entra com a senha e o Google fica conectado a essa
 * conta (sem isso, quem já tinha conta acabava criando uma segunda, vazia).
 */
export function GoogleSignupForm() {
  const submit = useApp((s) => s.googleSignupSubmit);
  const link = useApp((s) => s.googleSignupLink);
  const [step, setStep] = useState<'choose' | 'link' | 'create'>('choose');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [nameTaken, setNameTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [desktopDone, setDesktopDone] = useState<'created' | 'linked' | null>(null);

  const go = (s: typeof step) => {
    setStep(s);
    setError('');
    setNameTaken(false);
    setPassword('');
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNameTaken(false);
    setLoading(true);
    try {
      const r = step === 'link' ? await link(username, password) : await submit(username, displayName);
      if (r === 'desktop') setDesktopDone(step === 'link' ? 'linked' : 'created');
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setNameTaken(step === 'create' && /já está em uso/.test(msg));
      if (/expirou/.test(msg)) useApp.setState({ googleSignup: null });
    } finally {
      setLoading(false);
    }
  }

  if (desktopDone) {
    return (
      <div className="space-y-3 p-8 text-center md:p-10">
        <h2 className="text-2xl font-bold">{desktopDone === 'linked' ? 'Google conectado! 🎉' : 'Conta criada! 🎉'}</h2>
        <p className="text-sm text-fg-muted">Pode voltar para o app do Concord: ele já entrou na sua conta.</p>
      </div>
    );
  }

  const back = (
    <button
      type="button"
      onClick={() => (step === 'choose' ? useApp.setState({ googleSignup: null }) : go('choose'))}
      className="w-full text-sm font-semibold text-fg-muted hover:text-fg"
    >
      Voltar
    </button>
  );

  if (step === 'choose') {
    return (
      <div className="space-y-4 p-8 md:p-10">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <GoogleLogo /> Você já tem conta no Concord?
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Essa conta Google ainda não está ligada a nenhuma conta do Concord.</p>
        </div>
        <Button className="h-11 w-full" onClick={() => go('link')}>
          Já tenho conta: conectar o Google a ela
        </Button>
        <Button variant="secondary" className="h-11 w-full" onClick={() => go('create')}>
          Não tenho: criar uma conta nova
        </Button>
        {back}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-8 md:p-10">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <GoogleLogo /> {step === 'link' ? 'Conectar sua conta' : 'Quase lá!'}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {step === 'link'
            ? 'Entre com seu usuário e senha do Concord uma vez. Depois disso, "Entrar com Google" já abre essa conta.'
            : 'Escolha como você vai aparecer no Concord. Você entra sempre pelo Google, sem senha.'}
        </p>
      </div>
      <Input label={step === 'link' ? 'Usuário' : 'Nome de usuário'} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required autoComplete="username" hint={step === 'create' ? 'Letras, números, _ e .' : undefined} />
      {step === 'link' ? (
        <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      ) : (
        <Input label="Nome de exibição" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como os outros vão te ver" />
      )}
      {error && (
        <div className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">
          {error}
          {nameTaken && (
            <button type="button" onClick={() => go('link')} className="mt-1 block font-semibold text-fg hover:underline">
              Essa conta é minha: conectar o Google a ela
            </button>
          )}
        </div>
      )}
      <Button type="submit" loading={loading} className="h-11 w-full">
        {step === 'link' ? 'Entrar e conectar' : 'Criar conta'}
      </Button>
      {back}
    </form>
  );
}

/** Configurações > Conta: conectar ou desconectar o Google. */
export function GoogleAccountSection() {
  const enabled = useGoogleEnabled();
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const refresh = async () => setMe(await api.get<Me>('/me'));
  const { waiting, start, cancel } = useDesktopHandoff((r) => {
    if ('linked' in r) {
      toast.success('Conta Google conectada.');
      void refresh();
    } else if ('error' in r) toast.error(r.error);
  });
  if (!enabled && !me.googleLinked) return null;

  async function connect() {
    try {
      const { ticket } = await api.post<{ ticket: string }>('/me/google/link-ticket');
      if (desktop) start(`&link=${encodeURIComponent(ticket)}`);
      else location.href = `/api/auth/google/start?link=${encodeURIComponent(ticket)}`;
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-0 p-4">
      <GoogleLogo />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Conta Google</div>
        <div className="text-xs text-fg-muted">
          {me.googleLinked ? 'Conectada: você pode entrar com o Google.' : 'Conecte para entrar com o Google, sem digitar senha.'}
          {me.googleLinked && !me.hasPassword && ' Sua conta não tem senha: crie uma abaixo se quiser poder desconectar.'}
        </div>
      </div>
      {me.googleLinked ? (
        <>
          <span className="flex items-center gap-1 text-sm font-semibold text-ok">
            <Check size={15} /> Conectada
          </span>
          {me.hasPassword && (
            <Button variant="ghost" className="h-9" onClick={() => void api.del<Me>('/me/google').then(setMe, toast.error)}>
              <Unlink size={14} /> Desconectar
            </Button>
          )}
        </>
      ) : waiting ? (
        <Button variant="secondary" className="h-9" onClick={cancel}>
          Cancelar (continue no navegador)
        </Button>
      ) : (
        <Button variant="secondary" className="h-9" onClick={() => void connect()}>
          <Link2 size={14} /> Conectar
        </Button>
      )}
    </div>
  );
}
