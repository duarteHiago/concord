// Níveis de conta e Fator de Confiança (etapa 3 do plano de segurança). Compartilhado entre o servidor (cálculo e
// exigências) e o app (textos e telas). Funções puras: quem chama passa os sinais e o "agora".
//
// Regras combinadas:
// - a plataforma não bloqueia adulto por padrão: confiança baixa só pesa onde o dono do servidor ou do canal
//   escolheu um mínimo;
// - denúncia sozinha não baixa a confiança, só denúncia confirmada pela equipe;
// - a nota exata e o que entrou nela só a equipe vê (portal /admin). A pessoa vê o nível e a faixa.
import { REPORT_CATEGORY_INFO, type ReportCategory } from './reports.ts';

// ---------------------------------------------------------------- Níveis

/** 0 = sem verificação, 1 = e-mail confirmado (ou conta Google), 2 = telefone (SMS), 3 = identidade (depois) */
export type TrustLevel = 0 | 1 | 2 | 3;
export const TRUST_LEVELS: TrustLevel[] = [0, 1, 2, 3];
/** níveis que dá para alcançar hoje (o SMS e a verificação de identidade ainda não existem) */
export const AVAILABLE_LEVELS: TrustLevel[] = [0, 1];

export const LEVEL_INFO: Record<TrustLevel, { label: string; requirement: string }> = {
  0: { label: 'Sem verificação', requirement: 'qualquer conta' },
  1: { label: 'E-mail confirmado', requirement: 'e-mail confirmado' },
  2: { label: 'Telefone confirmado', requirement: 'telefone confirmado' },
  3: { label: 'Identidade verificada', requirement: 'identidade verificada' },
};

// ---------------------------------------------------------------- Nota

/** Faixas da nota (0 a 100). A pessoa e os donos de servidor só lidam com a faixa. */
export type TrustBand = 'low' | 'normal' | 'high';
export const BAND_MIN: Record<TrustBand, number> = { low: 0, normal: 35, high: 70 };
export const BAND_INFO: Record<TrustBand, { label: string; description: string }> = {
  low: { label: 'Baixa', description: 'A conta tem problemas confirmados pela equipe do Concord.' },
  normal: { label: 'Normal', description: 'Uma conta comum, sem problemas confirmados.' },
  high: { label: 'Alta', description: 'Conta antiga, protegida e com histórico limpo.' },
};

export function bandOf(score: number): TrustBand {
  return score >= BAND_MIN.high ? 'high' : score >= BAND_MIN.normal ? 'normal' : 'low';
}

const DAY = 86_400_000;

/**
 * Pesos da nota. Proposta seguindo a ordem combinada: o que mais baixa é a suspensão, depois a denúncia grave
 * confirmada, o ban em servidor e a denúncia leve confirmada. Sobem: e-mail (e depois o telefone), 2FA, idade da
 * conta e denúncias que a pessoa fez e a equipe confirmou. Ajustar aqui muda a nota de todo mundo na hora.
 */
export const TRUST_WEIGHTS = {
  base: 40,
  level: { 0: 0, 1: 10, 2: 20, 3: 25 } as Record<TrustLevel, number>,
  twoFactor: 10,
  /** pontos por mês de conta, até o teto */
  agePerMonth: 2,
  ageMax: 20,
  /** por denúncia feita pela pessoa e confirmada pela equipe, até o teto */
  helpfulReport: 2,
  helpfulMax: 10,
  /** por denúncia confirmada contra a pessoa (abuso infantil já zera a nota) */
  confirmed: { csam: 100, violence: 30, nudity: 25, harassment: 20, spam: 12, other: 8 } as Record<ReportCategory, number>,
  /** por servidor que baniu a pessoa, até o teto */
  serverBan: 8,
  serverBanMax: 32,
  /** problema com mais de tantos dias pesa a metade */
  halfAfterDays: 180,
};

export interface TrustSignals {
  suspended: boolean;
  level: TrustLevel;
  twoFactor: boolean;
  createdAt: number;
  /** denúncias confirmadas contra a pessoa (uma por caso: várias denúncias da mesma mensagem contam uma vez) */
  confirmedAgainst: { category: ReportCategory; at: number }[];
  /** bans em servidores (quando cada um aconteceu) */
  serverBans: number[];
  /** denúncias feitas pela pessoa que a equipe confirmou */
  helpfulReports: number;
}

export interface TrustItem {
  label: string;
  points: number;
}

export interface TrustResult {
  score: number;
  band: TrustBand;
  level: TrustLevel;
  items: TrustItem[];
}

export function computeTrust(s: TrustSignals, now: number): TrustResult {
  const w = TRUST_WEIGHTS;
  const items: TrustItem[] = [];
  const add = (label: string, points: number) => points && items.push({ label, points: Math.round(points) });
  const aged = (at: number) => (now - at > w.halfAfterDays * DAY ? 0.5 : 1);

  add('Ponto de partida', w.base);
  add(LEVEL_INFO[s.level].label, w.level[s.level]);
  if (s.twoFactor) add('Verificação em duas etapas', w.twoFactor);
  const months = Math.floor(Math.max(0, now - s.createdAt) / (30 * DAY));
  add(`Conta com ${months} ${months === 1 ? 'mês' : 'meses'}`, Math.min(w.ageMax, months * w.agePerMonth));
  add(`${s.helpfulReports} denúncia(s) feita(s) e confirmada(s)`, Math.min(w.helpfulMax, s.helpfulReports * w.helpfulReport));
  for (const c of s.confirmedAgainst) add(`Denúncia confirmada: ${REPORT_CATEGORY_INFO[c.category].label}`, -w.confirmed[c.category] * aged(c.at));
  const banPoints = s.serverBans.reduce((sum, at) => sum + w.serverBan * aged(at), 0);
  add(`Banida de ${s.serverBans.length} servidor(es)`, -Math.min(w.serverBanMax, banPoints));
  if (s.suspended) add('Conta suspensa pela equipe', -100);

  const raw = items.reduce((sum, i) => sum + i.points, 0);
  const score = s.suspended ? 0 : Math.max(0, Math.min(100, raw));
  return { score, band: bandOf(score), level: s.level, items };
}

// ---------------------------------------------------------------- Exigências por servidor e canal

/** entrar no servidor; falar (escrever, postar e usar o microfone); transmitir (tela ou câmera) */
export type TrustAction = 'join' | 'speak' | 'stream';
export const TRUST_ACTIONS: TrustAction[] = ['join', 'speak', 'stream'];
export const ACTION_INFO: Record<TrustAction, { label: string; description: string; verb: string }> = {
  join: { label: 'Entrar no servidor', description: 'Vale para convites novos. Quem já é membro continua.', verb: 'entrar neste servidor' },
  speak: { label: 'Falar', description: 'Mandar mensagens, postar no fórum e usar o microfone nas salas.', verb: 'falar aqui' },
  stream: { label: 'Transmitir', description: 'Compartilhar a tela ou abrir a câmera nas salas.', verb: 'transmitir aqui' },
};

export type BandRequirement = 'any' | 'normal' | 'high';
export interface TrustRequirement {
  level: TrustLevel;
  band: BandRequirement;
}
export type TrustRules = Partial<Record<TrustAction, TrustRequirement>>;

const BAND_ORDER: BandRequirement[] = ['any', 'normal', 'high'];
const isLevel = (v: unknown): v is TrustLevel => typeof v === 'number' && (TRUST_LEVELS as number[]).includes(v);

/** Confere o que veio do app. `channel`: canais não têm a exigência de entrar. Exigência vazia some. */
export function parseTrustRules(raw: unknown, channel: boolean): TrustRules | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Exigências inválidas';
  const out: TrustRules = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TRUST_ACTIONS as string[]).includes(key) || (channel && key === 'join')) return 'Exigência desconhecida';
    if (value == null) continue;
    const v = value as { level?: unknown; band?: unknown };
    const level = v.level ?? 0;
    const band = v.band ?? 'any';
    if (!isLevel(level) || !(AVAILABLE_LEVELS as number[]).includes(level)) return 'Esse nível de conta ainda não existe';
    if (!BAND_ORDER.includes(band as BandRequirement)) return 'Faixa de confiança inválida';
    if (level > 0 || band !== 'any') out[key as TrustAction] = { level, band: band as BandRequirement };
  }
  return out;
}

/** O mais exigente entre o servidor e o canal. */
export function strictest(a?: TrustRequirement, b?: TrustRequirement): TrustRequirement | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    level: Math.max(a.level, b.level) as TrustLevel,
    band: BAND_ORDER[Math.max(BAND_ORDER.indexOf(a.band), BAND_ORDER.indexOf(b.band))],
  };
}

export function meetsRequirement(req: TrustRequirement | undefined, t: { level: TrustLevel; score: number }): boolean {
  if (!req) return true;
  if (t.level < req.level) return false;
  return req.band === 'any' || t.score >= BAND_MIN[req.band];
}

/** "conta com e-mail confirmado e confiança Normal ou Alta" */
export function requirementText(req: TrustRequirement): string {
  const parts: string[] = [];
  if (req.level > 0) parts.push(LEVEL_INFO[req.level].requirement);
  if (req.band === 'normal') parts.push('confiança Normal ou Alta');
  if (req.band === 'high') parts.push('confiança Alta');
  return `conta com ${parts.join(' e ')}`;
}
