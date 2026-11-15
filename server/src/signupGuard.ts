// Barreiras contra contas em massa e bots: e-mail obrigatório (regras em shared/email.ts), limite de contas por
// rede (com o IPv6 contado por bloco) e o captcha da Cloudflare (Turnstile), quase invisível para quem é gente.
import type { Request } from 'express';
import { config } from './config.ts';
import { fail } from './http.ts';
import { mailEnabled } from './mail.ts';
import { isIpv6 } from './net.ts';
import { limiter, networkKey, quota } from './recovery.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Conta com senha precisa de um e-mail confirmado (só com o envio de e-mail configurado; REQUIRE_EMAIL=false desliga). */
export const emailRequired = () => config.requireEmail && mailEnabled();

// Contas criadas, por rede e por aparelho. O IPv4 é bem folgado: no 4G (e em muitas operadoras de casa) centenas de
// pessoas saem pelo mesmo IPv4 (CGNAT), e um limite apertado barrava gente de verdade quando muitas chegam juntas (uma
// divulgação). O IPv6 conta por bloco /64 (uma casa ou um aparelho) e, por cima, por /48 (quem aluga várias máquinas no
// mesmo provedor). O aparelho (um número aleatório guardado no app, ver client/src/lib/api.ts) não sofre com IP
// compartilhado. A barreira forte continua sendo o e-mail confirmado (um por caixa, só provedores grandes) e o captcha.
const accounts = {
  v4Hour: quota(20, HOUR, 'signup-acct-v4-hour'),
  v4Day: quota(60, DAY, 'signup-acct-v4-day'),
  v6Hour: quota(3, HOUR, 'signup-acct-v6-hour'),
  v6Day: quota(5, DAY, 'signup-acct-v6-day'),
  v6Wide: quota(10, DAY, 'signup-acct-v6-wide'),
  device: quota(3, DAY, 'signup-acct-device'),
};
// Tentativas (cada código mandado por e-mail): só para ninguém gastar o limite de e-mails do dia por uma rede.
const triesV4 = limiter(40, HOUR, 'signup-try-v4');
const triesV6 = limiter(10, HOUR, 'signup-try-v6');

const local = (ip: string) => !ip || /^(127\.|::1$|::ffff:127\.)/.test(ip);

/** O aparelho que o app mandou (X-Concord-Device), se veio num formato válido. */
function deviceOf(req: Request) {
  const d = req.get('x-concord-device') ?? '';
  return /^[A-Za-z0-9-]{16,64}$/.test(d) ? d : null;
}

/** As cotas de conta que valem para este pedido (a rede, e o aparelho se o app mandou). */
function accountKeys(req: Request) {
  const ip = req.ip ?? '';
  const out: [ReturnType<typeof quota>, string][] = [];
  if (!local(ip)) {
    if (isIpv6(ip)) {
      const net = networkKey(ip, 64);
      out.push([accounts.v6Hour, net], [accounts.v6Day, net], [accounts.v6Wide, networkKey(ip, 48)]);
    } else {
      const net = networkKey(ip);
      out.push([accounts.v4Hour, net], [accounts.v4Day, net]);
    }
  }
  const device = deviceOf(req);
  if (device) out.push([accounts.device, device]);
  return out;
}

/** Ainda dá para criar uma conta daqui (rede e aparelho)? Só confere: quem conta é signupCreated. */
export function signupAllowed(req: Request): boolean {
  return accountKeys(req).every(([q, key]) => q.left(key));
}

/** Uma conta nasceu deste pedido: conta na rede e no aparelho. */
export function signupCreated(req: Request) {
  for (const [q, key] of accountKeys(req)) q.use(key);
}

/** Pode mandar mais um código de cadastro para esta rede agora? (cada chamada conta) */
export function signupTryAllowed(req: Request): boolean {
  const ip = req.ip ?? '';
  if (local(ip)) return true;
  return isIpv6(ip) ? triesV6(networkKey(ip, 64)) : triesV4(networkKey(ip));
}

export const SIGNUP_LIMITED = 'Muitas contas foram criadas daqui hoje. Tente de novo mais tarde, ou por outra conexão (o Wi-Fi em vez dos dados móveis, por exemplo).';
export const SIGNUP_TRIES = 'Muitos códigos pedidos daqui agora. Espere alguns minutos e tente de novo.';

// ------------------------------------------------------------------ captcha (Cloudflare Turnstile)

/** A chave pública do widget, se o captcha está ligado (o app mostra o widget só com ela). */
export const captchaSiteKey = () => (config.turnstile.siteKey && config.turnstile.secret ? config.turnstile.siteKey : null);

type Verify = { success?: boolean; 'error-codes'?: string[]; hostname?: string };

/** Confere na Cloudflare o token que o widget gerou no navegador (vale uma vez só). Sem chaves, não faz nada. */
export async function requireCaptcha(req: Request, token: unknown) {
  if (!captchaSiteKey()) return;
  if (typeof token !== 'string' || !token || token.length > 2048) fail(400, 'Confirme que você não é um robô.');
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.turnstile.secret, response: token, remoteip: local(req.ip ?? '') ? undefined : req.ip }),
    signal: AbortSignal.timeout(8_000),
  })
    .then((r) => r.json() as Promise<Verify>)
    .catch((err: Error): Verify => ({ success: false, 'error-codes': [`fetch:${err.name}`] }));
  if (!result.success) {
    // só os códigos técnicos da Cloudflare (e o domínio que ela viu), para entender por que recusou; nada da pessoa
    const codes = (result['error-codes'] ?? []).map((c) => String(c).replace(/[^\w:-]/g, '').slice(0, 40)).join(',') || 'sem-codigo';
    console.warn(`[captcha] recusado: ${codes}${result.hostname ? ` (${String(result.hostname).replace(/[^\w.-]/g, '').slice(0, 80)})` : ''}`);
    const expired = (result['error-codes'] ?? []).includes('timeout-or-duplicate');
    fail(400, expired ? 'A verificação anti-robô expirou. Ela vai rodar de novo sozinha; espere um instante e tente outra vez.' : 'Não deu para confirmar que você não é um robô. Espere a verificação rodar de novo e tente outra vez.');
  }
}
