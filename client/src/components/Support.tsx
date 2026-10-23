// Apoio voluntário ao Concord: a janela do Pix (valor → QR → confirmado) e a aba "Apoiar" das
// configurações (patch de apoiador, acabamentos liberados e qual mostrar). Servidor: server/src/support.ts.
import { Check, Copy, EyeOff, Heart, Lock, QrCode, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  SUPPORTER_TIERS,
  formatBRL,
  nextTier,
  topTier,
  unlockedTiers,
  type SupporterTier,
} from '../../../shared/supporter.ts';
import { api } from '../lib/api';
import type { Me } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { SupporterPatch } from './SupporterPatch';
import { Button, Modal, Spinner, cx } from './ui';

interface SupportConfig {
  enabled: boolean;
  test: boolean;
  minCents: number;
  maxCents: number;
  presets: number[];
}

interface Payment {
  id: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'expired' | 'refunded';
  qrCode: string | null;
  qrBase64: string | null;
  expiresAt: number;
  test: boolean;
}

let configCache: Promise<SupportConfig> | null = null;
const loadConfig = () => (configCache ??= api.get<SupportConfig>('/support').catch(() => ({ enabled: false, test: false, minCents: 300, maxCents: 50_000, presets: [] })));

/** Configuração do apoio (null enquanto carrega). Sem provedor configurado no servidor, `enabled` é false. */
export function useSupportConfig() {
  const [config, setConfig] = useState<SupportConfig | null>(null);
  useEffect(() => void loadConfig().then(setConfig), []);
  return config;
}

// ------------------------------------------------------------------ janela do Pix

export function SupportModal() {
  const close = useApp((s) => s.closeModal);
  const openModal = useApp((s) => s.openModal);
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const config = useSupportConfig();
  const [amount, setAmount] = useState(1_000);
  const [custom, setCustom] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [totalBefore] = useState(me.supportTotal ?? 0);

  const cents = custom ? Math.round(Number(custom.replace(',', '.')) * 100) || 0 : amount;
  const valid = !!config && cents >= config.minCents && cents <= config.maxCents;
  const after = totalBefore + (valid ? cents : 0);
  const willHave = topTier(after);
  const hadBefore = topTier(totalBefore);

  // a cada 3 s pergunta ao servidor (que confere no Mercado Pago de tempos em tempos)
  useEffect(() => {
    if (!payment || payment.status !== 'pending') return;
    const t = setInterval(async () => {
      const next = await api.get<Payment>(`/support/pix/${payment.id}`).catch(() => null);
      if (next && next.status !== payment.status) setPayment(next);
    }, 3000);
    return () => clearInterval(t);
  }, [payment]);

  // pagou: atualiza o próprio perfil (o socket também avisa, isto é só garantia)
  useEffect(() => {
    if (payment?.status === 'paid') void api.get<Me>('/me').then(setMe, () => {});
  }, [payment?.status, setMe]);

  const generate = async () => {
    setBusy(true);
    try {
      setPayment(await api.post<Payment>('/support/pix', { amountCents: cents }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!payment?.qrCode) return;
    await navigator.clipboard.writeText(payment.qrCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!config) {
    return (
      <Modal title="Apoiar o Concord" onClose={close}>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Modal>
    );
  }

  if (!config.enabled) {
    return (
      <Modal title="Apoiar o Concord" onClose={close}>
        <p className="text-sm text-fg-muted">O apoio ainda não está disponível nesta instalação do Concord.</p>
      </Modal>
    );
  }

  // ---- pago
  if (payment?.status === 'paid') {
    const tier = topTier(totalBefore + payment.amountCents)!;
    const upgraded = tier !== hadBefore;
    return (
      <Modal onClose={close} width={440}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="animate-pop-in">
            <SupporterPatch tier={tier} size={150} />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Valeu demais! 💛</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Seu apoio de <b className="text-fg">{formatBRL(payment.amountCents)}</b> ajuda a manter o servidor no ar.
              {upgraded
                ? hadBefore
                  ? ` Você liberou o acabamento ${SUPPORTER_TIERS.find((t) => t.id === tier)!.name}!`
                  : ' Seu patch de apoiador já aparece no seu perfil.'
                : ' Seu total de apoio foi atualizado.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>
              Fechar
            </Button>
            <Button onClick={() => openModal({ type: 'userSettings', tab: 'support' })}>
              <Sparkles size={16} /> Ver meus acabamentos
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ---- QR do Pix
  if (payment && payment.status === 'pending') {
    return (
      <Modal title={`Pix de ${formatBRL(payment.amountCents)}`} subtitle="Abra o app do seu banco, escolha pagar com Pix e escaneie o código." onClose={close} width={440}>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white p-3">
            {payment.qrBase64 ? (
              <img src={`data:image/png;base64,${payment.qrBase64}`} alt="QR code do Pix" width={220} height={220} />
            ) : (
              <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 text-center text-sm font-semibold text-neutral-700">
                <QrCode size={48} />
                QR de teste
                <span className="px-4 text-xs font-normal">Modo de teste: nenhum dinheiro de verdade.</span>
              </div>
            )}
          </div>
          <div className="w-full">
            <p className="mb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">Ou use o Pix copia e cola</p>
            <div className="flex gap-2">
              <input readOnly value={payment.qrCode ?? ''} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 truncate rounded-xl bg-surface-0 px-3 text-xs text-fg-muted outline-none" />
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner size={16} /> Esperando o pagamento… Esta janela atualiza sozinha.
          </p>
          <Expiry until={payment.expiresAt} />
          {payment.test && (
            <Button
              variant="secondary"
              onClick={async () => setPayment(await api.post<Payment>(`/support/pix/${payment.id}/simulate`).catch((e) => (toast.error(e), payment)))}
            >
              Simular pagamento (teste)
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  // ---- escolher o valor
  return (
    <Modal
      title="Apoiar o Concord"
      subtitle="O Concord é grátis e de código aberto. Se quiser ajudar a pagar o servidor, qualquer valor ajuda, e você ganha o patch de apoiador."
      onClose={close}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Agora não
          </Button>
          <Button disabled={!valid} loading={busy} onClick={() => void generate()}>
            <Heart size={16} /> Gerar Pix de {valid ? formatBRL(cents) : '…'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {payment?.status === 'expired' && (
          <p className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            <RefreshCw size={15} /> O QR anterior venceu. Gere outro quando quiser.
          </p>
        )}
        <div className="flex items-center gap-4 rounded-2xl bg-surface-0 p-4">
          {willHave ? <SupporterPatch tier={willHave} size={88} /> : <SupporterPatch tier="aurora" size={88} locked />}
          <div className="min-w-0 text-sm">
            <p className="font-bold">{willHave ? SUPPORTER_TIERS.find((t) => t.id === willHave)!.name : 'Patch de apoiador'}</p>
            <p className="text-fg-muted">
              {willHave && willHave !== hadBefore
                ? hadBefore
                  ? 'Com esse apoio você libera este acabamento novo.'
                  : 'Aparece no seu perfil assim que o Pix cair.'
                : hadBefore
                  ? 'Seu patch continua com você, e o apoio soma no seu total.'
                  : `A partir de ${formatBRL(config.minCents)}.`}
            </p>
            <NextTierHint total={after} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Quanto você quer apoiar?</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {config.presets.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setAmount(p);
                  setCustom('');
                }}
                className={cx(
                  'rounded-xl border py-3 text-center font-display text-lg font-bold transition-all',
                  !custom && amount === p ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10' : 'border-line bg-surface-0 hover:border-line-strong',
                )}
              >
                {formatBRL(p).replace(',00', '')}
              </button>
            ))}
          </div>
          <label className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-line bg-surface-0 px-3 focus-within:border-accent">
            <span className="text-sm text-fg-muted">Outro valor: R$</span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00"
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
            />
          </label>
          {custom && !valid && (
            <p className="mt-1 text-xs text-warn">
              Entre {formatBRL(config.minCents)} e {formatBRL(config.maxCents)}.
            </p>
          )}
        </div>
        <p className="text-xs text-fg-subtle">
          Pagamento por Pix, processado pelo Mercado Pago. O apoio não libera funções: tudo no Concord continua grátis para todo mundo.
          {config.test && ' (Modo de teste: nenhum dinheiro de verdade.)'}
        </p>
      </div>
    </Modal>
  );
}

function Expiry({ until }: { until: number }) {
  const [left, setLeft] = useState(until - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(until - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left <= 0) return <p className="text-xs text-warn">Este QR venceu.</p>;
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <p className="text-xs text-fg-subtle">
      Vale por mais {m}:{String(s).padStart(2, '0')}
    </p>
  );
}

function NextTierHint({ total }: { total: number }) {
  const next = nextTier(total);
  if (!next || total === 0) return null;
  return (
    <p className="mt-1 text-xs text-fg-subtle">
      Faltam {formatBRL(next.min - total)} no total para o {next.name}.
    </p>
  );
}

// ------------------------------------------------------------------ aba "Apoiar" das configurações

export function SupportTab() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const openModal = useApp((s) => s.openModal);
  const config = useSupportConfig();
  const total = me.supportTotal ?? 0;
  const unlocked = unlockedTiers(total);
  const shown = me.supportTier ?? null;
  const [saving, setSaving] = useState<string | null>(null);

  const choose = async (tier: SupporterTier | null) => {
    setSaving(tier ?? 'off');
    try {
      await api.patch('/me/supporter', { tier });
      setMe({ ...me, supportTier: tier, supporter: tier ? { tier } : null });
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-5 rounded-[24px] bg-surface-0 p-5 sm:flex-row">
        {shown ? <SupporterPatch tier={shown} size={128} /> : <SupporterPatch tier={topTier(total) ?? 'aurora'} size={128} locked={!unlocked.length} />}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="font-display text-xl font-bold">{unlocked.length ? 'Você apoia o Concord 💛' : 'Patch de apoiador'}</h3>
          <p className="mt-1 text-sm text-fg-muted">
            {unlocked.length
              ? `Total apoiado: ${formatBRL(total)}. O patch fica no seu perfil, e o acabamento sobe conforme você apoia.`
              : 'O Concord é grátis e de código aberto. Quem apoia com qualquer valor a partir de R$ 3 ganha este patch no perfil, e ele ganha acabamentos mais raros conforme o apoio cresce.'}
          </p>
          <NextTierHint total={total} />
          {config?.enabled ? (
            <Button className="mt-3" onClick={() => openModal({ type: 'support' })}>
              <Heart size={16} /> {unlocked.length ? 'Apoiar de novo' : 'Apoiar o Concord'}
            </Button>
          ) : (
            config && <p className="mt-3 text-xs text-fg-subtle">O apoio ainda não está disponível nesta instalação.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">Acabamentos</h3>
        <p className="mb-3 text-xs text-fg-subtle">Liberados pelo total apoiado. Escolha qual aparece no seu perfil.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {SUPPORTER_TIERS.map((t) => {
            const open = unlocked.includes(t.id);
            const active = shown === t.id;
            return (
              <button
                key={t.id}
                disabled={!open || !!saving}
                onClick={() => void choose(t.id)}
                className={cx(
                  'relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all',
                  active ? 'border-accent bg-accent/10' : 'border-line bg-surface-0',
                  open && !active && 'hover:border-line-strong',
                  !open && 'cursor-default',
                )}
              >
                {saving === t.id ? (
                  <div className="flex h-[64px] items-center">
                    <Spinner />
                  </div>
                ) : (
                  <SupporterPatch tier={t.id} size={64} locked={!open} />
                )}
                <span className="text-sm font-bold">{t.name}</span>
                <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                  {open ? active ? <><Check size={11} /> No perfil</> : 'Liberado' : <><Lock size={11} /> {formatBRL(t.min)} no total</>}
                </span>
              </button>
            );
          })}
        </div>
        {unlocked.length > 0 && (
          <button
            disabled={!!saving || shown === null}
            onClick={() => void choose(null)}
            className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-50"
          >
            <EyeOff size={13} /> {shown === null ? 'Patch escondido do perfil' : 'Esconder o patch do perfil'}
          </button>
        )}
      </div>
    </div>
  );
}
