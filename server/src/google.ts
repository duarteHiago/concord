// Login com Google (OpenID Connect, fluxo "authorization code" com PKCE).
// Só guardamos o identificador da conta Google (sub): nada de e-mail, foto ou acesso a dados.
import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.ts';

// (os endereços só mudam nos testes automatizados, que usam um Google de mentira)
const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const TTL = 10 * 60_000;

export const googleEnabled = () => !!(config.google.clientId && config.google.clientSecret && config.publicUrl);
export const redirectUri = () => `${config.publicUrl}/api/auth/google/callback`;

export type GoogleMode = 'login' | 'link';

interface Pending {
  verifier: string;
  mode: GoogleMode;
  userId?: string; // conectar conta (mode = link)
  handoff?: string; // app desktop: o login volta por aqui
  at: number;
}

/** Guardados em memória: valem 10 minutos e são de uso único. */
const states = new Map<string, Pending>();
const signups = new Map<string, { sub: string; handoff?: string; at: number }>();
const handoffs = new Map<string, { result: HandoffResult; at: number }>();
const linkTickets = new Map<string, { userId: string; at: number }>();

export type HandoffResult = { token: string } | { signup: string } | { linked: true } | { error: string };

function sweep() {
  const old = Date.now() - TTL;
  for (const m of [states, signups, handoffs, linkTickets] as Map<string, { at: number }>[]) {
    for (const [k, v] of m) if (v.at < old) m.delete(k);
  }
}
setInterval(sweep, 60_000).unref();

const rand = (n = 32) => randomBytes(n).toString('base64url');
const take = <T extends { at: number }>(m: Map<string, T>, k: string): T | null => {
  const v = m.get(k);
  m.delete(k);
  return v && v.at > Date.now() - TTL ? v : null;
};

export const isHandoffId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{32,64}$/.test(s);

/** Começa o login: devolve o endereço do Google para onde o navegador vai. */
export function startUrl(opts: { mode: GoogleMode; userId?: string; handoff?: string }) {
  const state = rand();
  const verifier = rand(48);
  states.set(state, { verifier, ...opts, at: Date.now() });
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${q}`;
}

/** Troca o código pelo id_token e devolve o "sub" (identificador da conta Google). */
export async function finish(state: string, code: string): Promise<{ sub: string; pending: Pending }> {
  const pending = take(states, state);
  if (!pending) throw new Error('O login demorou demais ou já foi usado. Tente de novo.');
  const res = await fetch(TOKEN_URL, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code,
      code_verifier: pending.verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
    }),
  }).catch(() => {
    throw new Error('Não foi possível falar com o Google agora. Tente de novo em instantes.');
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !body.id_token) throw new Error('O Google não confirmou o login. Tente de novo.');
  // O id_token veio direto do Google por HTTPS (troca servidor-servidor): pelo OpenID Connect, a
  // conexão TLS já garante a origem. Ainda assim conferimos para quem foi emitido e a validade.
  const claims = JSON.parse(Buffer.from(body.id_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
  };
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!claims.sub || claims.aud !== config.google.clientId || !issOk || !claims.exp || claims.exp * 1000 < Date.now()) {
    throw new Error('Resposta do Google inválida.');
  }
  return { sub: claims.sub, pending };
}

/** Conta Google nova: a pessoa ainda escolhe o nome de usuário (ticket de 10 minutos). */
export function newSignup(sub: string, handoff?: string) {
  const ticket = rand();
  signups.set(ticket, { sub, handoff, at: Date.now() });
  return ticket;
}
export const takeSignup = (ticket: string) => take(signups, ticket);
export const peekSignup = (ticket: string) => {
  const v = signups.get(ticket);
  return v && v.at > Date.now() - TTL ? v : null;
};

/** App desktop: o resultado fica esperando o app buscar (uma vez). */
export const putHandoff = (id: string, result: HandoffResult) => handoffs.set(id, { result, at: Date.now() });
export const takeHandoff = (id: string) => take(handoffs, id)?.result ?? null;

/** Conectar Google a uma conta já logada: o navegador não manda o token, então vai um ticket de uso único. */
export function newLinkTicket(userId: string) {
  const t = rand();
  linkTickets.set(t, { userId, at: Date.now() });
  return t;
}
export const takeLinkTicket = (t: string) => take(linkTickets, t)?.userId ?? null;
