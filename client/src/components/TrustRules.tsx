// Fator de Confiança no app (ver shared/trust.ts):
// - TrustRulesEditor: as exigências mínimas de um servidor ou canal (aba "Segurança" das configurações);
// - TrustCard: o nível e a faixa da própria conta (Configurações → Conta e segurança).
import { useEffect, useState } from 'react';
import {
  ACTION_INFO,
  AVAILABLE_LEVELS,
  BAND_INFO,
  LEVEL_INFO,
  TRUST_LEVELS,
  requirementText,
  type BandRequirement,
  type TrustAction,
  type TrustBand,
  type TrustLevel,
  type TrustRequirement,
  type TrustRules,
} from '../../../shared/trust.ts';
import { api } from '../lib/api';
import { toast } from '../store/toast';
import { Button, cx } from './ui';

const BAND_OPTIONS: { id: BandRequirement; label: string }[] = [
  { id: 'any', label: 'Qualquer confiança' },
  { id: 'normal', label: 'Normal ou Alta' },
  { id: 'high', label: 'Só Alta' },
];

const selectClass = 'h-9 w-full rounded-xl bg-surface-0 px-3 text-sm font-medium text-fg outline-none focus:ring-1 focus:ring-accent disabled:opacity-50';

function RuleRow({
  action,
  value,
  inherited,
  onChange,
}: {
  action: TrustAction;
  value: TrustRequirement | undefined;
  inherited?: TrustRequirement;
  onChange: (v: TrustRequirement | undefined) => void;
}) {
  const level = value?.level ?? 0;
  const band = value?.band ?? 'any';
  const set = (next: TrustRequirement) => onChange(next.level === 0 && next.band === 'any' ? undefined : next);
  return (
    <div className="rounded-2xl bg-surface-0/60 p-3 ring-1 ring-line">
      <div className="text-sm font-semibold">{ACTION_INFO[action].label}</div>
      <div className="mb-2 text-xs text-fg-muted">{ACTION_INFO[action].description}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold tracking-wide text-fg-subtle uppercase">Conta</span>
          <select className={selectClass} value={level} onChange={(e) => set({ level: Number(e.target.value) as TrustLevel, band })}>
            {TRUST_LEVELS.map((l) => (
              <option key={l} value={l} disabled={!AVAILABLE_LEVELS.includes(l)}>
                {l === 0 ? 'Qualquer conta' : LEVEL_INFO[l].label}
                {!AVAILABLE_LEVELS.includes(l) ? ' (em breve)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold tracking-wide text-fg-subtle uppercase">Confiança</span>
          <select className={selectClass} value={band} onChange={(e) => set({ level, band: e.target.value as BandRequirement })}>
            {BAND_OPTIONS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {inherited && <p className="mt-2 text-xs text-fg-muted">O servidor já pede {requirementText(inherited)}. Aqui vale a mais exigente das duas.</p>}
    </div>
  );
}

/** Exigências de um servidor (`channelId` vazio) ou de um canal. */
export function TrustRulesEditor({ serverId, channelId }: { serverId: string; channelId?: string }) {
  const path = channelId ? `/channels/${channelId}/trust-rules` : `/servers/${serverId}/trust-rules`;
  const [rules, setRules] = useState<TrustRules | null>(null);
  const [inherited, setInherited] = useState<TrustRules>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ server?: TrustRules; channel?: TrustRules }>(path)
      .then((r) => {
        if (!alive) return;
        setRules((channelId ? r.channel : r.server) ?? {});
        if (channelId) setInherited(r.server ?? {});
      })
      .catch(toast.error);
    return () => {
      alive = false;
    };
  }, [path, channelId]);

  if (!rules) return <p className="text-sm text-fg-muted">Carregando…</p>;
  const actions: TrustAction[] = channelId ? ['speak', 'stream'] : ['join', 'speak', 'stream'];

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {channelId
          ? 'Escolha o mínimo que uma conta precisa ter para falar ou transmitir neste canal.'
          : 'Escolha o mínimo que uma conta precisa ter para entrar, falar ou transmitir no servidor. Cada canal pode pedir mais.'}{' '}
        Por padrão o Concord não bloqueia ninguém: só vale o que você escolher aqui. Quem gerencia o servidor e os bots ficam de fora.
      </p>
      <div className="rounded-2xl bg-surface-0/60 p-3 text-xs text-fg-muted ring-1 ring-line">
        <b className="text-fg">Como funciona a confiança:</b> toda conta tem uma nota que sobe com o tempo de conta, a verificação em duas etapas e o
        e-mail confirmado, e desce quando a equipe do Concord confirma uma denúncia contra ela ou quando ela é banida de servidores. Denúncia sem
        confirmação não conta. A nota exata só a equipe vê; aqui você escolhe a faixa (
        {(['low', 'normal', 'high'] as TrustBand[]).map((b, i) => (
          <span key={b}>
            {i > 0 && ', '}
            {BAND_INFO[b].label}
          </span>
        ))}
        ).
      </div>
      {actions.map((a) => (
        <RuleRow key={a} action={a} value={rules[a]} inherited={inherited[a]} onChange={(v) => setRules((r) => ({ ...(r ?? {}), [a]: v }) as TrustRules)} />
      ))}
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const res = await api.put<{ rules: TrustRules }>(path, { rules });
            setRules(res.rules);
            toast.success('Exigências salvas');
          } catch (err) {
            toast.error(err);
          }
          setSaving(false);
        }}
      >
        Salvar exigências
      </Button>
    </div>
  );
}

/** O nível e a faixa de confiança da própria conta. */
export function TrustCard() {
  const [trust, setTrust] = useState<{ level: TrustLevel; band: TrustBand } | null>(null);
  useEffect(() => {
    api
      .get<{ level: TrustLevel; band: TrustBand }>('/me/trust')
      .then(setTrust)
      .catch(() => {});
  }, []);
  if (!trust) return null;
  const tone = trust.band === 'high' ? 'text-ok' : trust.band === 'low' ? 'text-danger' : 'text-fg';
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Confiança da conta</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-0 p-3">
          <div className="text-[11px] font-bold tracking-wide text-fg-subtle uppercase">Nível</div>
          <div className="font-semibold">{LEVEL_INFO[trust.level].label}</div>
        </div>
        <div className="rounded-2xl bg-surface-0 p-3">
          <div className="text-[11px] font-bold tracking-wide text-fg-subtle uppercase">Confiança</div>
          <div className={cx('font-semibold', tone)}>{BAND_INFO[trust.band].label}</div>
          <div className="text-xs text-fg-muted">{BAND_INFO[trust.band].description}</div>
        </div>
      </div>
      <p className="text-xs text-fg-muted">
        Alguns servidores pedem um mínimo para entrar, falar ou transmitir. A confiança sobe com o tempo de conta, com a verificação em duas etapas
        e com o e-mail confirmado, e com denúncias suas que a equipe confirma.
      </p>
    </div>
  );
}
