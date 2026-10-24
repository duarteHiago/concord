// Verificação em duas etapas (TOTP): o código de 6 dígitos de um app autenticador. A tela do código no
// login, a seção em Configurações > Conta e o modal com os códigos de backup.
import { ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { Me } from '../lib/types';
import { useApp, type Modal as ModalState } from '../store/app';
import { toast } from '../store/toast';
import { Button, Input, Modal, cx } from './ui';

/** Segunda etapa do login: aparece no lugar do formulário enquanto houver um ticket pendente. */
export function TwoFactorStep() {
  const submit = useApp((s) => s.submitTwoFactor);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await submit(code);
    } catch (err) {
      // ticket vencido (ou a senha mudou nesse meio-tempo): volta para o login, com o aviso num toast
      if (err instanceof ApiError && err.status === 401) {
        toast.error(err);
        useApp.setState({ mfaTicket: null });
        return;
      }
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-8 md:p-10">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck size={24} className="text-accent" /> Verificação em duas etapas
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {backup ? 'Digite um dos códigos de backup que você guardou. Cada um vale uma vez só.' : 'Abra seu app autenticador e digite o código de 6 dígitos do Concord.'}
        </p>
      </div>
      <Input
        key={backup ? 'backup' : 'totp'}
        label={backup ? 'Código de backup' : 'Código'}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={backup ? 'XXXX-XXXX' : '123456'}
        inputMode={backup ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={backup ? 9 : 6}
        className="font-mono tracking-widest"
        autoFocus
        required
      />
      {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} disabled={backup ? code.replace(/[^a-z0-9]/gi, '').length !== 8 : !/^\d{6}$/.test(code)} className="h-11 w-full">
        Entrar
      </Button>
      <button
        type="button"
        onClick={() => {
          setBackup(!backup);
          setCode('');
          setError('');
        }}
        className="text-sm font-semibold text-fg-muted hover:text-accent"
      >
        {backup ? 'Usar o código do app' : 'Perdi o celular: usar um código de backup'}
      </button>
      <p className="text-sm text-fg-muted">
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => useApp.setState({ mfaTicket: null })}>
          Voltar para o login
        </button>
      </p>
    </form>
  );
}

/** Campo do código para ações sensíveis (trocar senha, e-mail...): só aparece com o 2FA ligado. */
export function TwoFactorCodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const on = useApp((s) => !!s.me?.twoFactor);
  if (!on) return null;
  return (
    <Input
      label="Código de verificação"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Do app autenticador ou de backup"
      autoComplete="one-time-code"
      maxLength={9}
      className="font-mono tracking-widest"
    />
  );
}

/** Configurações > Conta: ligar, desligar e gerar códigos de backup novos. */
export function TwoFactorSection() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const openModal = useApp((s) => s.openModal);
  const noPassword = me.hasPassword === false;
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!setup) return setQr('');
    void QRCode.toDataURL(setup.uri, { margin: 1, width: 200 }).then(setQr, () => setQr(''));
  }, [setup]);

  async function run(action: () => Promise<void>) {
    setLoading(true);
    try {
      await action();
    } catch (err) {
      toast.error(err);
    }
    setLoading(false);
  }

  const showCodes = (codes: string[]) => openModal({ type: 'backupCodes', codes, next: { type: 'userSettings', tab: 'account' } });

  const start = () =>
    run(async () => {
      setSetup(await api.post<{ secret: string; uri: string }>('/me/2fa/setup', { password }));
      setPassword('');
      setCode('');
    });

  const confirm = () =>
    run(async () => {
      const res = await api.post<{ backupCodes: string[]; me: Me; clockOffsetSec?: number }>('/me/2fa/enable', { code });
      setMe(res.me);
      setSetup(null);
      setCode('');
      showCodes(res.backupCodes);
      // funciona mesmo assim (o servidor guarda a diferença), mas vale avisar: outros sites não fazem isso
      const off = res.clockOffsetSec ?? 0;
      if (Math.abs(off) >= 60) {
        const min = Math.round(Math.abs(off) / 60);
        toast.info(`O relógio do seu celular está uns ${min} min ${off > 0 ? 'adiantado' : 'atrasado'}. Funcionou, mas vale colocar a hora no automático.`);
      }
    });

  const newCodes = () =>
    run(async () => {
      const res = await api.post<{ backupCodes: string[]; me: Me }>('/me/2fa/backup-codes', { code });
      setMe(res.me);
      setCode('');
      showCodes(res.backupCodes);
    });

  const turnOff = () =>
    run(async () => {
      setMe(await api.post<Me>('/me/2fa/disable', { code }));
      setCode('');
      toast.success('Verificação em duas etapas desligada.');
    });

  return (
    <div className="space-y-3 rounded-2xl bg-surface-0 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={16} className={me.twoFactor ? 'text-ok' : undefined} /> Verificação em duas etapas
        {me.twoFactor && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-bold text-ok">Ligada</span>}
      </h3>

      {me.twoFactor ? (
        <>
          <p className="text-sm text-fg-muted">
            Para entrar, além da senha, é preciso o código do seu app autenticador.{' '}
            <span className={cx((me.backupCodesLeft ?? 0) <= 2 && 'font-semibold text-warn')}>
              {me.backupCodesLeft ?? 0} código(s) de backup restante(s).
            </span>
          </p>
          <TwoFactorCodeInput value={code} onChange={setCode} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={loading} disabled={!code} onClick={() => void newCodes()}>
              Gerar novos códigos de backup
            </Button>
            <Button variant="danger" loading={loading} disabled={!code} onClick={() => void turnOff()}>
              Desligar
            </Button>
          </div>
        </>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">
            1. No celular, abra um app autenticador (Google Authenticator, Microsoft Authenticator, 2FAS, Authy...) e escaneie o QR code.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="grid h-[200px] w-[200px] shrink-0 place-items-center rounded-xl bg-white">
              {qr && <img src={qr} alt="QR code para o app autenticador" width={200} height={200} className="rounded-xl" />}
            </div>
            <div className="min-w-0 space-y-1 text-sm text-fg-muted">
              <p>Não consegue escanear? Digite esta chave no app:</p>
              <p className="rounded-lg bg-surface-3 px-3 py-2 font-mono text-xs break-all text-fg select-all">{setup.secret}</p>
            </div>
          </div>
          <p className="text-sm text-fg-muted">2. Digite o código de 6 dígitos que apareceu no app:</p>
          <div className="flex items-end gap-2">
            <Input
              label="Código"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="font-mono tracking-widest"
            />
            <Button loading={loading} disabled={!/^\d{6}$/.test(code)} onClick={() => void confirm()} className="h-11 shrink-0">
              Confirmar e ligar
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)} className="h-11 shrink-0">
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Protege sua conta mesmo se alguém descobrir sua senha: para entrar, também vai ser preciso o código que aparece num app no seu celular.
          </p>
          <div className="flex items-end gap-2">
            {noPassword ? (
              <span className="flex-1" />
            ) : (
              <Input label="Senha atual" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="flex-1" />
            )}
            <Button loading={loading} disabled={!password && !noPassword} onClick={() => void start()} className="h-11 shrink-0">
              Ativar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Os códigos de backup aparecem uma vez só: precisa copiar ou baixar antes de fechar. */
export function BackupCodesModal({ codes, next }: Extract<ModalState, { type: 'backupCodes' }>) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = useApp((s) => s.me);
  const finish = () => useApp.setState({ modal: next ?? null });
  const text = codes.join('\n');

  function download() {
    const body = `Códigos de backup do Concord (verificação em duas etapas)\nConta: @${me?.username}\nSite: ${location.origin}\n\n${text}\n\nCada código vale uma vez só. Use quando estiver sem o app autenticador.\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `concord-backup-2fa-${me?.username ?? 'conta'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <Modal
      title="Guarde seus códigos de backup"
      subtitle="Se perder o celular, é com eles que você entra. Cada um vale uma vez só, e eles só aparecem agora."
      onClose={() => saved && finish()}
      footer={
        <Button disabled={!saved} onClick={finish}>
          Já guardei, continuar
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-0 p-5 text-center font-mono text-lg font-bold tracking-widest select-all">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setSaved(true);
            } catch {
              toast.error('Não foi possível copiar. Selecione os códigos e copie manualmente.');
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
        Guardei os códigos num lugar seguro
      </label>
    </Modal>
  );
}
