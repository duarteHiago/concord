// Contratos de Mecenato (servidor: server/src/contracts.ts; regras: shared/contracts.ts). Aqui ficam a aba
// "Mecenato" das configurações (contrato, convite, Escudo, multas, histórico), a janela "Sacanagens e
// Peripécias" (os poderes do Mecenas), a janela de renovação do contrato antigo e o Pix da multa.
// Tudo que aparece vem do servidor: o app só mostra e pede.
import { FileText, Gem, Headphones, History, ImagePlus, Mic, MicOff, Pencil, PhoneOff, RotateCcw, Shield, ShieldCheck, Sparkles, VolumeX, Wand2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CONTRACT_COOLDOWN_HOURS,
  CONTRACT_DAY_PRESETS,
  CONTRACT_MAX_DAYS,
  FINE_FIXED_CENTS,
  FINE_PERCENT,
  PRANK_EFFECTS,
  SHIELD_MAX_MS,
  VOICE_FX_MAX_MS,
  VOICE_FX_MIN_MS,
  VOICE_FX_WINDOW_MAX_MS,
} from '../../../shared/contracts.ts';
import { formatBRL } from '../../../shared/supporter.ts';
import { api } from '../lib/api';
import { effectLabel, endReasonText, eventText, fmtSpan } from '../lib/contractText';
import type { Contract, ContractBrief, ContractEvent, ContractFine, ContractUser, ShieldView } from '../lib/types';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import { useApp } from '../store/app';
import { useContracts } from '../store/contracts';
import { toast } from '../store/toast';
import { PixPending, usePixPolling, type Payment } from './Support';
import { Avatar, Button, Modal, Spinner, Toggle, cx } from './ui';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Relógio que anda sozinho (contagens regressivas). */
function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

const namer = (people: ContractUser[], meId?: string) => (id: string | null | undefined) =>
  id === meId ? 'Você' : (people.find((p) => p.id === id)?.displayName ?? 'Alguém');

// ------------------------------------------------------------------ termos

/** As regras, iguais na proposta, no aceite e na renovação. */
function Terms({ days, cooldownHours, tieClause }: { days: number; cooldownHours: number; tieClause: boolean }) {
  return (
    <ul className="space-y-1.5 rounded-2xl bg-surface-0 p-4 text-xs text-fg-muted">
      <li>
        • Vale por <b className="text-fg">{days} {days === 1 ? 'dia' : 'dias'}</b> depois que os dois aceitarem.
      </li>
      <li>
        • O <b className="text-fg">Mecenas</b> é quem apoiar mais o Concord durante o contrato: os dois começam no zero, o apoio de antes não conta. Se o outro
        passar, vira o Mecenas na hora (o prazo não muda).
      </li>
      <li>
        • O Mecenas pode: silenciar, ensurdecer, tirar da sala, trocar o apelido, trocar a foto/GIF do perfil (volta a original no fim) e soltar um efeito
        de voz surpresa de até 5 s.
      </li>
      <li>
        • {tieClause ? 'Com a cláusula de empate: empatados, os dois têm os poderes um sobre o outro.' : 'Sem a cláusula de empate: no empate, quem já era o Mecenas continua.'}
      </li>
      <li>
        • Cada um tem um <b className="text-fg">Escudo</b> de 3 h que bloqueia tudo isso. Depois de usar, espera {cooldownHours} h para ligar de novo. Se zerar, as 3 h
        voltam inteiras 24 h depois.
      </li>
      <li>
        • Rescindir antes do prazo: multa de <b className="text-fg">{formatBRL(FINE_FIXED_CENTS)} + {FINE_PERCENT}%</b> do que os dois apoiaram durante o contrato, para
        quem rescindiu. Sair por segurança não tem multa e passa pela equipe.
      </li>
      <li>• Tudo fica no histórico do contrato, que os dois veem.</li>
    </ul>
  );
}

// ------------------------------------------------------------------ Escudo

function ShieldMeter({ shield, now }: { shield: ShieldView; now: number }) {
  const balance = shield.active && shield.runsOutAt ? Math.max(0, shield.runsOutAt - now) : shield.balanceMs;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-4">
      <div className={cx('h-full rounded-full transition-[width]', shield.active ? 'bg-accent' : 'bg-fg-subtle')} style={{ width: `${(balance / SHIELD_MAX_MS) * 100}%` }} />
    </div>
  );
}

function shieldStatus(shield: ShieldView, now: number) {
  if (shield.active && shield.runsOutAt) return `Ligado: acaba em ${fmtSpan(shield.runsOutAt - now)}`;
  if (shield.restoresAt) return `Sem saldo: as 3 h voltam em ${fmtSpan(shield.restoresAt - now)}`;
  if (shield.cooldownUntil && shield.cooldownUntil > now) return `Intervalo: liga de novo em ${fmtSpan(shield.cooldownUntil - now)}`;
  return 'Desligado';
}

function ShieldCard({ shield }: { shield: ShieldView }) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const balance = shield.active && shield.runsOutAt ? Math.max(0, shield.runsOutAt - now) : shield.balanceMs;
  const blocked = !shield.active && (balance <= 0 || (!!shield.cooldownUntil && shield.cooldownUntil > now));

  const toggle = async () => {
    setBusy(true);
    try {
      await api.post('/contracts/shield', { on: !shield.active });
      await useContracts.getState().load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-surface-0 p-5">
      <div className="flex items-center gap-3">
        <span className={cx('flex h-11 w-11 items-center justify-center rounded-2xl', shield.active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted')}>
          {shield.active ? <ShieldCheck size={20} /> : <Shield size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold">Meu Escudo</h3>
          <p className="text-xs text-fg-muted">{shieldStatus(shield, now)}</p>
        </div>
        <Button variant={shield.active ? 'secondary' : 'primary'} disabled={blocked} loading={busy} onClick={() => void toggle()}>
          {shield.active ? 'Desligar' : 'Ligar o Escudo'}
        </Button>
      </div>
      <ShieldMeter shield={shield} now={now} />
      <p className="text-xs text-fg-subtle">
        Saldo: <b className="text-fg">{fmtSpan(balance)}</b> de 3 h. Com ele ligado, o Mecenas não consegue fazer nada com você (e o que ele já tinha feito, como
        silenciar, é desfeito).
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ painel do contrato

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 text-sm last:border-0">
      <span className="text-fg-muted">{label}</span>
      <span className="min-w-0 text-right font-semibold">{children}</span>
    </div>
  );
}

function Person({ user, badge }: { user: ContractUser; badge?: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl} size={22} />
      <span className="truncate">{user.displayName}</span>
      {badge}
    </span>
  );
}

/** Tudo do contrato em vigor, num quadro (pedido do documento: participantes, liderança, valores, Escudos e multa). */
function ContractTable({ c, meId }: { c: Contract; meId: string }) {
  const now = useNow();
  const people = [c.creator, c.invitee];
  const name = namer(people, meId);
  const [a, b] = people;
  const diff = Math.abs((c.totals[a.id] ?? 0) - (c.totals[b.id] ?? 0));
  const leader =
    c.holders.length === 2
      ? 'Os dois (empate com a cláusula)'
      : c.holders.length === 1
        ? name(c.holders[0])
        : c.contributedCents === 0
          ? 'Ninguém ainda: quem apoiar primeiro'
          : 'Ninguém (empate)';
  return (
    <div className="rounded-2xl bg-surface-1 px-4 py-2">
      <Row label="Participantes">
        <span className="flex flex-col items-end gap-1">
          {people.map((p) => (
            <Person key={p.id} user={p} badge={c.holders.includes(p.id) ? <Gem size={13} className="text-warn" /> : undefined} />
          ))}
        </span>
      </Row>
      <Row label="Mecenas agora">{leader}</Row>
      {people.map((p) => (
        <Row key={p.id} label={`Apoio de ${name(p.id)} no contrato`}>
          {formatBRL(c.totals[p.id] ?? 0)}
        </Row>
      ))}
      <Row label="Diferença">{formatBRL(diff)}</Row>
      <Row label="Tempo restante">{c.endsAt ? fmtSpan(c.endsAt - now) : '—'}</Row>
      <Row label="Estado">{c.status === 'active' ? 'Em vigor' : c.status === 'pending' ? 'Esperando aceite' : endReasonText(c.endReason)}</Row>
      <Row label="Cláusula de empate">{c.tieClause ? (c.tie ? 'Ligada (empatados agora)' : 'Ligada') : 'Desligada'}</Row>
      <Row label="Intervalo do Escudo">{fmtSpan(c.cooldownMs)}</Row>
      {c.shields &&
        people.map((p) => {
          const s = c.shields![p.id];
          const balance = s.active && s.runsOutAt ? Math.max(0, s.runsOutAt - now) : s.balanceMs;
          return (
            <Row key={p.id} label={`Escudo de ${name(p.id)}`}>
              <span className="flex flex-col items-end">
                <span>{shieldStatus(s, now)}</span>
                <span className="text-xs font-normal text-fg-muted">Saldo {fmtSpan(balance)}</span>
              </span>
            </Row>
          );
        })}
      <Row label="Apoiado durante o contrato">{formatBRL(c.contributedCents)}</Row>
      {c.fineEstimateCents !== null && <Row label="Multa se rescindir agora">{formatBRL(c.fineEstimateCents)}</Row>}
    </div>
  );
}

function EventList({ events, people, meId }: { events: ContractEvent[]; people: ContractUser[]; meId: string }) {
  const name = namer(people, meId);
  if (!events.length) return <p className="text-sm text-fg-subtle">Nada ainda.</p>;
  return (
    <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <time className="w-28 shrink-0 text-xs text-fg-subtle tabular-nums" dateTime={new Date(e.at).toISOString()}>
            {new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </time>
          <span className="min-w-0">{eventText(e, name)}</span>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ proposta e convite

function ProposeForm() {
  const [username, setUsername] = useState('');
  const [days, setDays] = useState<number>(7);
  const [cooldownHours, setCooldownHours] = useState<number>(1);
  const [tieClause, setTieClause] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/contracts', { username: username.trim(), durationDays: days, cooldownHours, tieClause, acceptTerms: true });
      toast.success('Convite enviado. O contrato começa quando a outra pessoa aceitar.');
      await useContracts.getState().load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-surface-0 p-5">
      <div className="flex items-center gap-3">
        <FileText size={20} className="text-accent" />
        <h3 className="font-display text-lg font-bold">Propor um contrato</h3>
      </div>
      <label className="flex h-11 items-center gap-1 rounded-xl border border-line bg-surface-1 px-3 focus-within:border-accent">
        <span className="text-fg-subtle">@</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/^@/, '').replace(/\s/g, ''))}
          placeholder="usuario"
          aria-label="Nome de usuário de quem você quer convidar"
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
        />
      </label>
      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-fg-muted uppercase">Prazo</p>
        <div className="flex flex-wrap items-center gap-2">
          {CONTRACT_DAY_PRESETS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cx('h-9 rounded-full px-4 text-sm font-bold', days === d ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
            >
              {d} {d === 1 ? 'dia' : 'dias'}
            </button>
          ))}
          <label className="flex h-9 items-center gap-1 rounded-full bg-surface-3 px-3 text-sm">
            <input
              type="number"
              min={1}
              max={CONTRACT_MAX_DAYS}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(CONTRACT_MAX_DAYS, Math.round(Number(e.target.value) || 1))))}
              aria-label="Prazo em dias"
              className="w-12 bg-transparent text-center font-bold outline-none"
            />
            dias
          </label>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-fg-muted uppercase">Intervalo do Escudo</p>
        <div className="flex gap-2">
          {CONTRACT_COOLDOWN_HOURS.map((h) => (
            <button
              key={h}
              onClick={() => setCooldownHours(h)}
              className={cx('h-9 rounded-full px-4 text-sm font-bold', cooldownHours === h ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
            >
              {h} h
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <b>Cláusula de empate</b>
          <span className="block text-xs text-fg-muted">Empatados no apoio, os dois têm os poderes um sobre o outro.</span>
        </span>
        <Toggle checked={tieClause} onChange={setTieClause} />
      </label>
      <Terms days={days} cooldownHours={cooldownHours} tieClause={tieClause} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
        Li e aceito os termos
      </label>
      <Button disabled={!username.trim() || !agreed} loading={busy} onClick={() => void submit()}>
        Enviar convite
      </Button>
    </section>
  );
}

function InviteCard({ c, meId, supported }: { c: Contract; meId: string; supported: boolean }) {
  const openModal = useApp((s) => s.openModal);
  const now = useNow();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const other = c.creator.id === meId ? c.invitee : c.creator;
  const acceptedByMe = !!c.accepted[meId];
  const run = async (what: 'accept' | 'decline') => {
    setBusy(what);
    try {
      await api.post(`/contracts/${c.id}/${what}`, what === 'accept' ? { acceptTerms: true } : {});
      await useContracts.getState().load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="flex flex-col gap-4 rounded-[24px] bg-surface-0 p-5">
      <div className="flex items-center gap-3">
        <Avatar name={other.displayName} color={other.avatarColor} src={other.avatarUrl} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold">{c.renewal ? 'Renovação do contrato' : acceptedByMe ? 'Convite enviado' : 'Você recebeu um convite'}</h3>
          <p className="text-xs text-fg-muted">
            Com {other.displayName} (@{other.username}) · {acceptedByMe ? `esperando ${other.displayName} aceitar` : 'esperando você'} · vale por mais{' '}
            {fmtSpan(c.inviteExpiresAt - now)}
          </p>
        </div>
      </div>
      <Terms days={Math.round(c.durationMs / DAY)} cooldownHours={Math.round(c.cooldownMs / HOUR)} tieClause={c.tieClause} />
      {!acceptedByMe && !supported && (
        <div className="flex flex-col gap-2 rounded-2xl bg-warn/10 p-4 text-sm sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-warn">Para aceitar, você precisa apoiar o Concord pela sua conta (qualquer valor confirmado vale).</p>
          <Button onClick={() => openModal({ type: 'support' })}>Apoiar</Button>
        </div>
      )}
      {!acceptedByMe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          Li e aceito os termos
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!acceptedByMe && (
          <Button disabled={!agreed || !supported} loading={busy === 'accept'} onClick={() => void run('accept')}>
            Aceitar o contrato
          </Button>
        )}
        <Button variant="ghost" loading={busy === 'decline'} onClick={() => void run('decline')}>
          {acceptedByMe && !c.renewal ? 'Cancelar o convite' : 'Recusar'}
        </Button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ aba das configurações

export function MecenatoTab() {
  const data = useContracts((s) => s.data);
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);

  useEffect(() => void useContracts.getState().load(), []);

  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const c = data.current;
  const openFines = data.fines.filter((f) => f.status === 'open');
  const supported = data.supportTotalCents > 0;

  return (
    <div className="space-y-6">
      {openFines.map((f) => (
        <FineCard key={f.id} fine={f} />
      ))}

      {c?.status === 'active' && (
        <>
          <section className="flex flex-col gap-4 rounded-[24px] bg-surface-0 p-5">
            <div className="flex items-center gap-3">
              <Gem size={20} className="text-warn" />
              <h3 className="min-w-0 flex-1 font-display text-lg font-bold">Contrato em vigor</h3>
              <Button onClick={() => openModal({ type: 'pranks' })}>
                <Sparkles size={16} /> Sacanagens e Peripécias
              </Button>
            </div>
            <button className="text-left" onClick={() => openModal({ type: 'pranks' })} aria-label="Abrir Sacanagens e Peripécias">
              <ContractTable c={c} meId={me.id} />
            </button>
          </section>
          <ShieldCard shield={c.shields?.[me.id] ?? data.shield} />
        </>
      )}

      {c?.status === 'pending' && <InviteCard c={c} meId={me.id} supported={supported} />}

      {!c &&
        (openFines.length ? null : supported ? (
          <ProposeForm />
        ) : (
          <section className="flex flex-col items-start gap-3 rounded-[24px] bg-surface-0 p-5">
            <h3 className="font-display text-lg font-bold">Contratos de Mecenato</h3>
            <p className="text-sm text-fg-muted">
              Duas pessoas que apoiam o Concord combinam, por até 30 dias, que quem apoiou mais vira o Mecenas e pode aprontar com a outra. Para propor ou aceitar
              um contrato, apoie o Concord com qualquer valor.
            </p>
            <Button onClick={() => openModal({ type: 'support' })}>Apoiar o Concord</Button>
          </section>
        ))}

      {!c?.shields && c?.status !== 'pending' && data.shield.balanceMs < SHIELD_MAX_MS && (
        <p className="text-xs text-fg-subtle">Seu Escudo: {shieldStatus(data.shield, Date.now())} · saldo {fmtSpan(data.shield.balanceMs)}.</p>
      )}

      {data.history.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-fg-muted uppercase">
            <History size={14} /> Contratos encerrados
          </h3>
          <ul className="space-y-2">
            {data.history.map((h) => (
              <HistoryRow key={h.id} h={h} meId={me.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HistoryRow({ h, meId }: { h: ContractBrief; meId: string }) {
  const other = h.creator.id === meId ? h.invitee : h.creator;
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Contract | null>(null);
  const toggle = async () => {
    setOpen(!open);
    if (!detail) setDetail(await api.get<Contract>(`/contracts/${h.id}`).catch((e) => (toast.error(e), null)));
  };
  return (
    <li className="rounded-2xl bg-surface-0 px-4 py-3">
      <button className="flex w-full items-center gap-3 text-left" onClick={() => void toggle()}>
        <Avatar name={other.displayName} color={other.avatarColor} src={other.avatarUrl} size={28} />
        <span className="min-w-0 flex-1 text-sm">
          <b>{other.displayName}</b>
          <span className="block text-xs text-fg-muted">
            {endReasonText(h.endReason)} · {h.endedAt ? new Date(h.endedAt).toLocaleDateString('pt-BR') : ''}
          </span>
        </span>
      </button>
      {open && <div className="mt-3">{detail ? <EventList events={detail.events} people={[h.creator, h.invitee]} meId={meId} /> : <Spinner size={18} />}</div>}
    </li>
  );
}

function FineCard({ fine }: { fine: ContractFine }) {
  const openModal = useApp((s) => s.openModal);
  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-danger/10 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-bold">Multa de rescisão em aberto</h3>
        <p className="text-sm text-fg-muted">
          {formatBRL(FINE_FIXED_CENTS)} + {FINE_PERCENT}% de {formatBRL(fine.baseCents)} apoiados durante o contrato. Enquanto não for paga, você não entra em outro
          contrato.
        </p>
      </div>
      <Button onClick={() => openModal({ type: 'finePix', fineId: fine.id, amountCents: fine.amountCents })}>Pagar {formatBRL(fine.amountCents)}</Button>
    </section>
  );
}

// ------------------------------------------------------------------ Sacanagens e Peripécias

function PowerButton({ icon, label, onClick, disabled, busy }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-0 px-3 py-3 text-xs font-bold transition-colors hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-0"
    >
      {busy ? <Spinner size={20} /> : icon}
      {label}
    </button>
  );
}

export function PranksModal() {
  const close = useApp((s) => s.closeModal);
  const openModal = useApp((s) => s.openModal);
  const me = useApp((s) => s.me)!;
  const data = useContracts((s) => s.data);
  const c = data?.current?.status === 'active' ? data.current : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [serverId, setServerId] = useState('');
  const [nickname, setNickname] = useState('');
  const [effect, setEffect] = useState<string>(PRANK_EFFECTS[0]);
  const [fxSeconds, setFxSeconds] = useState(3);
  const [fxWindow, setFxWindow] = useState(60);
  const [safety, setSafety] = useState<string | null>(null);

  useEffect(() => void useContracts.getState().load(), []);
  useEffect(() => {
    if (c && !serverId && c.mutualServers[0]) setServerId(c.mutualServers[0].id);
  }, [c, serverId]);

  if (!c) {
    return (
      <Modal title="Sacanagens e Peripécias" onClose={close}>
        <p className="text-sm text-fg-muted">Nenhum contrato em vigor agora.</p>
      </Modal>
    );
  }

  const other = c.creator.id === me.id ? c.invitee : c.creator;
  const amHolder = c.holders.includes(me.id);
  const shielded = !!c.shields?.[other.id]?.active;
  const v = c.otherVoice;
  const can = amHolder && !shielded;

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const next = await api.post<Contract>(`/contracts/${c.id}/powers`, body);
      if (data) useContracts.getState().set({ ...data, current: next });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const changeAvatar = async () => {
    const file = await pickImage();
    if (!file) return;
    setBusy('avatar');
    try {
      const next = await uploadImage<Contract>(`/contracts/${c.id}/avatar`, await prepareImage(file, 512, true));
      if (data) useContracts.getState().set({ ...data, current: next });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const restoreAvatar = async () => {
    setBusy('restore');
    try {
      const next = await api.del<Contract>(`/contracts/${c.id}/avatar`);
      if (data) useContracts.getState().set({ ...data, current: next });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const cancelFx = async () => {
    const next = await api.del<Contract>(`/contracts/${c.id}/voice-fx`).catch((e) => (toast.error(e), null));
    if (next && data) useContracts.getState().set({ ...data, current: next });
  };

  const rescind = () => {
    const cents = c.fineEstimateCents ?? 0;
    openModal({
      type: 'confirm',
      title: 'Rescindir o contrato?',
      message: `O contrato acaba agora e fica uma multa de ${formatBRL(cents)} para você (${formatBRL(FINE_FIXED_CENTS)} + ${FINE_PERCENT}% do que vocês apoiaram durante o contrato). Enquanto não pagar, você não entra em outro contrato.`,
      confirmLabel: `Rescindir e ficar com a multa`,
      danger: true,
      onConfirm: async () => {
        await api.post(`/contracts/${c.id}/rescind`, { confirmCents: cents });
        await useContracts.getState().load();
        toast.info('Contrato rescindido. A multa está na aba Mecenato.');
      },
    });
  };

  const safetyEnd = async () => {
    setBusy('safety');
    try {
      await api.post(`/contracts/${c.id}/safety-end`, { note: safety ?? '' });
      await useContracts.getState().load();
      toast.info('Contrato encerrado. A equipe vai dar uma olhada.');
      close();
    } catch (err) {
      toast.error(err);
      setBusy(null);
    }
  };

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={20} className="text-warn" /> Sacanagens e Peripécias
        </span>
      }
      subtitle={
        amHolder
          ? `Você é o Mecenas de ${other.displayName}. Use com sabedoria (ou não).`
          : c.holders.length
            ? `Quem manda agora é ${other.displayName}. Apoie mais que ele para virar o jogo.`
            : 'Empate: ninguém tem os poderes agora.'
      }
      onClose={close}
      width={620}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-0 p-3">
          <Avatar name={other.displayName} color={other.avatarColor} src={other.avatarUrl} size={40} />
          <div className="min-w-0 flex-1 text-sm">
            <b>{other.displayName}</b>
            <span className="block text-xs text-fg-muted">
              {shielded ? 'Com o Escudo ligado: nada funciona agora.' : v ? `Em chamada${v.serverMuted ? ' · silenciado' : ''}${v.serverDeafened ? ' · ensurdecido' : ''}` : 'Fora de chamada'}
            </span>
          </div>
          {shielded && <Shield size={18} className="text-accent" />}
        </div>

        {amHolder && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <PowerButton
                icon={v?.serverMuted ? <Mic size={20} /> : <MicOff size={20} />}
                label={v?.serverMuted ? 'Devolver o mic' : 'Silenciar'}
                disabled={!can || !v}
                busy={busy === 'mute'}
                onClick={() => void act('mute', { power: 'mute', on: !v?.serverMuted })}
              />
              <PowerButton
                icon={v?.serverDeafened ? <Headphones size={20} /> : <VolumeX size={20} />}
                label={v?.serverDeafened ? 'Devolver o som' : 'Ensurdecer'}
                disabled={!can || !v}
                busy={busy === 'deafen'}
                onClick={() => void act('deafen', { power: 'deafen', on: !v?.serverDeafened })}
              />
              <PowerButton icon={<PhoneOff size={20} />} label="Tirar da sala" disabled={!can || !v} busy={busy === 'disconnect'} onClick={() => void act('disconnect', { power: 'disconnect' })} />
            </div>

            <section className="space-y-2 rounded-2xl bg-surface-0 p-4">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <Pencil size={15} /> Apelido
              </h4>
              {c.mutualServers.length ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={serverId} onChange={(e) => setServerId(e.target.value)} aria-label="Servidor" className="h-10 rounded-xl bg-surface-1 px-3 text-sm outline-none">
                    {c.mutualServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={nickname}
                    maxLength={32}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={`Novo apelido de ${other.displayName}`}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-surface-1 px-3 text-sm outline-none"
                  />
                  <Button disabled={!can || !serverId} loading={busy === 'nickname'} onClick={() => void act('nickname', { power: 'nickname', serverId, nickname: nickname.trim() || null })}>
                    {nickname.trim() ? 'Trocar' : 'Tirar apelido'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-fg-subtle">Vocês não estão em nenhum servidor em comum.</p>
              )}
            </section>

            <section className="flex flex-col gap-2 rounded-2xl bg-surface-0 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <ImagePlus size={15} /> Foto do perfil
                </h4>
                <p className="text-xs text-fg-muted">Foto ou GIF. {other.displayName} não consegue trocar até o fim do contrato, quando a original volta.</p>
              </div>
              <div className="flex gap-2">
                {c.avatarOverrides.includes(other.id) && (
                  <Button variant="ghost" loading={busy === 'restore'} onClick={() => void restoreAvatar()}>
                    <RotateCcw size={15} /> Devolver
                  </Button>
                )}
                <Button disabled={!can} loading={busy === 'avatar'} onClick={() => void changeAvatar()}>
                  Escolher imagem
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl bg-surface-0 p-4">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <Wand2 size={15} /> Efeito de voz surpresa
              </h4>
              {c.pendingFx ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-fg-muted">
                    {effectLabel(c.pendingFx.effect)} por {c.pendingFx.durationMs / 1000} s, num momento sorteado. Esperando a hora…
                  </span>
                  <Button variant="ghost" onClick={() => void cancelFx()}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {PRANK_EFFECTS.map((id) => (
                      <button
                        key={id}
                        onClick={() => setEffect(id)}
                        className={cx('h-8 rounded-full px-3 text-xs font-bold', effect === id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
                      >
                        {effectLabel(id)}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-3 text-xs text-fg-muted">
                    <span className="w-28">Duração: {fxSeconds} s</span>
                    <input
                      type="range"
                      min={VOICE_FX_MIN_MS / 1000}
                      max={VOICE_FX_MAX_MS / 1000}
                      step={1}
                      value={fxSeconds}
                      onChange={(e) => setFxSeconds(Number(e.target.value))}
                      className="flex-1"
                    />
                  </label>
                  <label className="flex items-center gap-3 text-xs text-fg-muted">
                    <span className="w-28">Em até: {fxWindow >= 60 ? `${Math.floor(fxWindow / 60)} min${fxWindow % 60 ? ` ${fxWindow % 60} s` : ''}` : `${fxWindow} s`}</span>
                    <input
                      type="range"
                      min={0}
                      max={VOICE_FX_WINDOW_MAX_MS / 1000}
                      step={10}
                      value={fxWindow}
                      onChange={(e) => setFxWindow(Number(e.target.value))}
                      className="flex-1"
                    />
                  </label>
                  <p className="text-xs text-fg-subtle">O momento é sorteado pelo servidor dentro desse tempo. Só acontece se a pessoa estiver em chamada com o microfone ligado.</p>
                  <Button disabled={!can} loading={busy === 'fx'} onClick={() => void act('fx', { power: 'voice_fx', effect, durationMs: fxSeconds * 1000, windowMs: fxWindow * 1000 })}>
                    Agendar a surpresa
                  </Button>
                </>
              )}
            </section>
          </>
        )}

        <section>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-fg-muted uppercase">
            <History size={14} /> Histórico
          </h4>
          <EventList events={c.events} people={[c.creator, c.invitee]} meId={me.id} />
        </section>

        <section className="space-y-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={rescind}>
              Rescindir ({formatBRL(c.fineEstimateCents ?? 0)})
            </Button>
            <Button variant="ghost" onClick={() => setSafety(safety === null ? '' : null)}>
              Sair por segurança
            </Button>
          </div>
          {safety !== null && (
            <div className="space-y-2 rounded-2xl bg-surface-0 p-4">
              <p className="text-xs text-fg-muted">
                Se o contrato está fazendo mal a você, saia aqui: acaba na hora e sem multa. A equipe do Concord revisa o caso (se for só para fugir da multa, ela pode
                ser aplicada).
              </p>
              <textarea
                value={safety}
                maxLength={500}
                onChange={(e) => setSafety(e.target.value)}
                placeholder="O que aconteceu? (opcional, só a equipe vê)"
                className="h-20 w-full resize-none rounded-xl bg-surface-1 p-3 text-sm outline-none"
              />
              <Button variant="danger" loading={busy === 'safety'} onClick={() => void safetyEnd()}>
                Encerrar por segurança
              </Button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ renovação do contrato antigo

export function RenewalModal() {
  const close = useApp((s) => s.closeModal);
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const data = useContracts((s) => s.data);
  const c = data?.current?.status === 'pending' && data.current.renewal ? data.current : null;
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (!c) return null;
  const other = c.creator.id === me.id ? c.invitee : c.creator;
  const supported = (data?.supportTotalCents ?? 0) > 0;
  const later = () => {
    renewalSnoozed = true;
    close();
  };
  const run = async (what: 'accept' | 'decline') => {
    setBusy(what);
    try {
      await api.post(`/contracts/${c.id}/${what}`, what === 'accept' ? { acceptTerms: true } : {});
      await useContracts.getState().load();
      if (what === 'accept') toast.success(c.accepted[other.id] ? 'Contrato renovado!' : `Aceito! Falta ${other.displayName} aceitar.`);
      close();
    } catch (err) {
      toast.error(err);
      setBusy(null);
    }
  };
  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Gem size={20} className="text-warn" /> Renovação do contrato de Mecenato
        </span>
      }
      subtitle={`O Mecenas do Concord agora funciona por contrato, com prazo e com o aceite dos dois. Seu par com ${other.displayName} continua, se vocês dois aceitarem.`}
      onClose={later}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={later}>
            Depois
          </Button>
          <Button variant="ghost" loading={busy === 'decline'} onClick={() => void run('decline')}>
            Recusar
          </Button>
          <Button disabled={!agreed || !supported} loading={busy === 'accept'} onClick={() => void run('accept')}>
            Renovar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          {c.creator.id === me.id ? 'Você continua começando como o Mecenas.' : `${other.displayName} continua começando como o Mecenas.`} Daqui para frente, quem apoiar
          mais assume.
        </p>
        <Terms days={Math.round(c.durationMs / DAY)} cooldownHours={Math.round(c.cooldownMs / HOUR)} tieClause={c.tieClause} />
        {!supported && (
          <div className="flex items-center gap-3 rounded-2xl bg-warn/10 p-3 text-sm">
            <span className="min-w-0 flex-1 text-warn">Para renovar, você precisa ter apoiado o Concord (qualquer valor).</span>
            <Button onClick={() => openModal({ type: 'support' })}>Apoiar</Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          Li e aceito os termos
        </label>
      </div>
    </Modal>
  );
}

let renewalSnoozed = false;

/** Abre a renovação ao entrar, uma vez por sessão, se ainda falta o aceite desta pessoa. */
export function useContractRenewal() {
  const meId = useApp((s) => s.me?.id);
  const modal = useApp((s) => s.modal);
  const pending = useContracts((s) => {
    const c = s.data?.current;
    return !!meId && !!c && c.status === 'pending' && c.renewal && !c.accepted[meId];
  });
  useEffect(() => {
    if (!pending || modal || renewalSnoozed) return;
    const t = setTimeout(() => useApp.getState().openModal({ type: 'contractRenewal' }), 600);
    return () => clearTimeout(t);
  }, [pending, modal]);
}

// ------------------------------------------------------------------ Pix da multa

export function FinePixModal({ fineId, amountCents }: { fineId: string; amountCents: number }) {
  const close = useApp((s) => s.closeModal);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  usePixPolling(payment, setPayment);
  useEffect(() => {
    if (payment?.status === 'paid') void useContracts.getState().load();
  }, [payment?.status]);

  const generate = async () => {
    setBusy(true);
    try {
      setPayment(await api.post<Payment>(`/contracts/fines/${fineId}/pix`));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (payment?.status === 'paid') {
    return (
      <Modal title="Multa paga" onClose={close}>
        <p className="text-sm text-fg-muted">Tudo certo. Você já pode entrar em outro contrato quando quiser.</p>
      </Modal>
    );
  }
  if (payment?.status === 'pending') {
    return (
      <Modal title={`Pix de ${formatBRL(payment.amountCents)}`} subtitle="Multa de rescisão do contrato de Mecenato." onClose={close} width={440}>
        <PixPending payment={payment} onChange={setPayment} />
      </Modal>
    );
  }
  return (
    <Modal
      title="Pagar a multa de rescisão"
      subtitle="Pelo mesmo Pix do apoio. A multa não conta como apoio (não sobe o patch nem dá vantagem em contrato)."
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Agora não
          </Button>
          <Button loading={busy} onClick={() => void generate()}>
            Gerar Pix de {formatBRL(amountCents)}
          </Button>
        </>
      }
    >
      {payment?.status === 'expired' && <p className="text-sm text-warn">O QR anterior venceu. Gere outro.</p>}
    </Modal>
  );
}
