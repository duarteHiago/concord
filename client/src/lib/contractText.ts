// Textos dos contratos de Mecenato (histórico, motivos de fim, tempos), usados no app (Mecenato.tsx) e no
// portal da equipe (admin/Contracts.tsx). Fica leve de propósito: o portal não carrega o resto do app.
import { formatBRL } from '../../../shared/supporter.ts';
import type { ContractEvent } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function fmtSpan(ms: number) {
  if (ms <= 0) return 'agora';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  return m ? `${m} min` : `${Math.ceil(ms / 1000)} s`;
}

/** Os mesmos nomes de lib/voiceEffects.ts (EFFECTS), sem carregar o processamento de áudio. */
const EFFECT_LABELS: Record<string, string> = {
  deep: 'Voz grossa',
  chipmunk: 'Esquilo',
  robot: 'Robô',
  radio: 'Rádio',
  megaphone: 'Megafone',
  echo: 'Eco',
  cave: 'Caverna',
};

export const effectLabel = (id: unknown) => EFFECT_LABELS[String(id)] ?? String(id);

const END_REASONS: Record<string, string> = {
  expired: 'Terminou no prazo',
  rescinded: 'Rescindido antes do prazo',
  safety: 'Encerrado por segurança',
  staff: 'Encerrado pela equipe',
  declined: 'Convite recusado',
  cancelled: 'Convite cancelado',
  invite_expired: 'Convite expirou sem resposta',
};

export const endReasonText = (r: string | null) => (r ? (END_REASONS[r] ?? r) : '');

const POWER_TEXT: Record<string, string> = {
  mute: 'silenciou',
  unmute: 'devolveu o microfone de',
  deafen: 'ensurdeceu',
  undeafen: 'devolveu o som de',
  disconnect: 'tirou da sala',
  nickname: 'trocou o apelido de',
  avatar: 'trocou a foto de',
};

const SKIP_TEXT: Record<string, string> = {
  shield: 'o Escudo estava ligado',
  no_power: 'o Mecenas mudou',
  not_in_voice: 'não estava em chamada',
  muted: 'estava com o microfone desligado',
};

/** Uma linha do histórico, em português. `name` resolve o id para o nome de quem participa. */
export function eventText(e: ContractEvent, name: (id: string | null | undefined) => string): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const brl = (v: unknown) => formatBRL(Number(v ?? 0));
  switch (e.type) {
    case 'invited':
      return `${name(e.actorId)} propôs o contrato a ${name(e.userId)}`;
    case 'renewal_created':
      return 'Convite de renovação do contrato antigo';
    case 'accepted':
      return `${name(e.actorId)} aceitou os termos`;
    case 'started':
      return 'O contrato começou';
    case 'leader_changed':
      return d.to ? `${name(d.to as string)} virou o Mecenas` : 'Empate: ninguém tem os poderes sozinho';
    case 'contribution':
      return `${name(e.userId)} ${d.status === 'refunded' ? 'teve um apoio estornado' : `apoiou ${brl(d.amountCents)}`}`;
    case 'shield_on':
      return `${name(e.userId)} ligou o Escudo`;
    case 'shield_off':
      return `${name(e.userId)} desligou o Escudo${d.auto ? ' (fim do contrato)' : ''}`;
    case 'shield_depleted':
      return `O Escudo de ${name(e.userId)} zerou: as 3 h voltam em 24 h`;
    case 'shield_restored':
      return `O Escudo de ${name(e.userId)} voltou a 3 h`;
    case 'power': {
      const verb = POWER_TEXT[d.power as string] ?? String(d.power);
      const extra = d.power === 'nickname' ? (d.nickname ? ` para "${d.nickname}"` : ' (tirou o apelido)') : '';
      return `${name(e.actorId)} ${verb} ${name(e.userId)}${extra}`;
    }
    case 'voice_fx_scheduled':
      return `${name(e.actorId)} agendou um efeito surpresa: ${effectLabel(d.effect)}`;
    case 'voice_fx':
      return `${name(e.actorId)} soltou o efeito ${effectLabel(d.effect)} na voz de ${name(e.userId)} por ${Number(d.durationMs) / 1000} s`;
    case 'voice_fx_skipped':
      return `O efeito surpresa não aconteceu: ${name(e.userId)} ${SKIP_TEXT[d.reason as string] ?? ''}`.trim();
    case 'voice_fx_cancelled':
      return 'Efeito surpresa cancelado';
    case 'avatar_restored':
      return `A foto de ${name(e.userId)} voltou ao normal`;
    case 'staff_restored_avatar':
      return 'A equipe devolveu a foto original';
    case 'fine_created':
      return `Multa de ${brl(d.amountCents)} para ${name(e.userId)}`;
    case 'fine_paid':
      return `${name(e.userId)} pagou a multa`;
    case 'fine_waived':
      return `A equipe dispensou a multa de ${name(e.userId)}`;
    case 'fine_reopened':
      return `O Pix da multa de ${name(e.userId)} foi estornado: a multa voltou a ficar em aberto`;
    case 'reviewed':
      return d.decision === 'fine' ? 'A equipe reaplicou a multa' : 'A equipe confirmou a saída por segurança';
    case 'ended':
      return endReasonText(d.reason as string);
    default:
      return e.type;
  }
}
