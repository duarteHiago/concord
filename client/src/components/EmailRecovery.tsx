// E-mail de recuperação (opcional): cadastrar o endereço nas configurações, pedir o link em
// "Esqueci minha senha" e escolher a senha nova pelo link que chega no e-mail.
import { Check, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { Me } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { TwoFactorCodeInput } from './TwoFactor';
import { Button, Input, Modal } from './ui';

// só o "sim" fica guardado: se o e-mail for ligado com o app aberto, a próxima tela já pergunta de novo
let emailOn = false;
export function useEmailRecovery() {
  const [on, setOn] = useState(emailOn);
  useEffect(() => {
    if (emailOn) return;
    api.get<{ emailRecovery?: boolean }>('/config').then((c) => {
      emailOn = !!c.emailRecovery;
      setOn(emailOn);
    }, () => {});
  }, []);
  return on;
}

/** "Esqueci minha senha" por e-mail: a resposta é sempre a mesma, exista a conta ou não. */
export function ForgotByEmail({ login, setLogin }: { login: string; setLogin: (v: string) => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot', { login });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-2xl bg-surface-3 p-4 text-sm text-fg-muted">
        <p className="flex items-center gap-2 font-semibold text-fg">
          <Mail size={16} /> Confira seu e-mail
        </p>
        <p>Se essa conta tiver um e-mail confirmado, o link chega em instantes. Ele vale por 30 minutos. Olhe também o spam.</p>
        <button type="button" onClick={() => setSent(false)} className="font-semibold text-accent hover:underline">
          Não chegou? Tentar de novo
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input label="Usuário ou e-mail" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus autoComplete="username" required />
      {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} className="h-11 w-full">
        Enviar link
      </Button>
    </form>
  );
}

/** Aberta pelo link do e-mail: escolher a senha nova (e já entrar). */
export function EmailResetScreen() {
  const submit = useApp((s) => s.emailResetSubmit);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('As duas senhas não são iguais.');
    setLoading(true);
    try {
      await submit(password);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md animate-pop-in space-y-4 rounded-3xl border border-line bg-surface-2/80 p-8 shadow-2xl md:p-10">
        <img src="/brand/concord-logo.png" alt="Concord" className="mb-4 h-9 w-auto" />
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Escolha uma senha nova</h2>
          <p className="mt-1 text-sm text-fg-muted">Depois de salvar, você entra na conta e os outros aparelhos saem dela.</p>
        </div>
        <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" hint="Mínimo de 6 caracteres" required />
        <Input label="Repita a senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
        <Button type="submit" loading={loading} disabled={password.length < 6} className="h-11 w-full">
          Salvar e entrar
        </Button>
        <button type="button" onClick={() => useApp.setState({ emailReset: null })} className="w-full text-sm font-semibold text-fg-muted hover:text-fg">
          Cancelar
        </button>
      </form>
    </div>
  );
}

// o aviso aparece no máximo uma vez por abertura do app
let promptChecked = false;

/**
 * Aviso de "agora dá para cadastrar um e-mail": aparece toda vez que o app abre, até a pessoa
 * cadastrar um e-mail ou clicar em "Depois eu vejo". Fechar no X só adia para a próxima abertura.
 */
export function useEmailPrompt() {
  const enabled = useEmailRecovery();
  const me = useApp((s) => s.me);
  const modal = useApp((s) => s.modal);
  const openModal = useApp((s) => s.openModal);
  const meId = me?.id;
  // conta nova (ainda no tutorial de boas-vindas): não empilha outro aviso nesta abertura
  useEffect(() => {
    if (meId && !useApp.getState().me?.settings.onboarded) promptChecked = true;
  }, [meId]);
  useEffect(() => {
    if (promptChecked || !enabled || !me || modal) return;
    // espera um pouco: o app termina de carregar e outros avisos (convite etc.) abrem primeiro
    const t = window.setTimeout(() => {
      const s = useApp.getState();
      if (promptChecked || !s.me || s.modal) return;
      promptChecked = true;
      if (!s.me.email && !s.me.emailPending && !s.me.settings.emailPromptDismissed) openModal({ type: 'emailPrompt' });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [enabled, me, modal, openModal]);
}

export function EmailPromptModal() {
  const close = useApp((s) => s.closeModal);
  const saveSettings = useApp((s) => s.saveSettings);
  const done = useApp((s) => !!(s.me?.email || s.me?.emailPending));
  // e-mail enviado para confirmação: o aviso já cumpriu o papel
  useEffect(() => {
    if (done) close();
  }, [done, close]);

  return (
    <Modal
      title="Novidade: recupere sua senha por e-mail"
      subtitle="Cadastre um e-mail e, se um dia esquecer a senha, receba um link para criar outra. É opcional: ninguém vê seu e-mail e não mandamos propaganda."
      onClose={close}
      footer={
        <Button
          variant="ghost"
          onClick={() => {
            void saveSettings({ emailPromptDismissed: true });
            close();
          }}
        >
          Depois eu vejo
        </Button>
      }
    >
      <EmailSection />
    </Modal>
  );
}

/** Configurações > Conta: cadastrar, trocar ou remover o e-mail de recuperação. */
export function EmailSection() {
  const enabled = useEmailRecovery();
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [loading, setLoading] = useState(false);
  if (!enabled && !me.email) return null;

  const showForm = enabled && (editing || !me.email);

  async function save() {
    setLoading(true);
    try {
      setMe(await api.put<Me>('/me/email', { email, password, twoFactorCode }));
      setEditing(false);
      setEmail('');
      setPassword('');
      setTwoFactorCode('');
      toast.success('Mandamos um link de confirmação. O e-mail só passa a valer depois do clique.');
    } catch (err) {
      toast.error(err);
    }
    setLoading(false);
  }

  async function remove() {
    try {
      setMe(await api.del<Me>('/me/email'));
      toast.success('E-mail removido da conta.');
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className={`space-y-3 rounded-2xl p-4 ${me.email ? 'bg-surface-0' : 'bg-warn/10 ring-1 ring-warn/40'}`}>
      <h3 className="flex items-center gap-2 font-semibold">
        <Mail size={16} /> E-mail de recuperação
      </h3>
      <p className="text-sm text-fg-muted">
        {me.email ? (
          <>
            <span className="inline-flex items-center gap-1 font-semibold text-ok">
              <Check size={14} /> {me.email}
            </span>{' '}
            recebe o link se você esquecer a senha.
          </>
        ) : (
          'Opcional. Cadastre um e-mail para receber um link se esquecer a senha. Ele não aparece para ninguém e não é usado para mais nada.'
        )}
      </p>
      {me.emailPending && (
        <p className="rounded-xl bg-surface-3 px-3 py-2 text-sm text-fg-muted">
          Esperando confirmação de <b className="text-fg">{me.emailPending}</b>. Abra o link que mandamos (olhe também o spam).
        </p>
      )}
      {showForm ? (
        <div className="space-y-2">
          <Input label={me.email ? 'Novo e-mail' : 'E-mail'} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {me.hasPassword !== false && (
            <Input label="Senha atual" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          )}
          <TwoFactorCodeInput value={twoFactorCode} onChange={setTwoFactorCode} />
          <div className="flex gap-2">
            <Button
              loading={loading}
              disabled={!email.includes('@') || (me.hasPassword !== false && !password) || (!!me.twoFactor && !twoFactorCode)}
              onClick={() => void save()}
            >
              Enviar confirmação
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {enabled && (
            <Button variant="secondary" className="h-9" onClick={() => setEditing(true)}>
              Trocar
            </Button>
          )}
          <Button variant="ghost" className="h-9" onClick={() => void remove()}>
            Remover
          </Button>
        </div>
      )}
    </div>
  );
}
