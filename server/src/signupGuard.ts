// Barreiras contra contas em massa e bots: e-mail obrigatório (regras em shared/email.ts), limite de contas por
// rede (com o IPv6 contado por bloco) e o captcha da Cloudflare (Turnstile), quase invisível para quem é gente.
import type { Request } from 'express';
import { config } from './config.ts';
import { fail } from './http.ts';
import { mailEnabled } from './mail.ts';
import { isIpv6 } from './net.ts';
import { limiter, networkKey } from './recovery.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Conta com senha precisa de um e-mail confirmado (só com o envio de e-mail configurado; REQUIRE_EMAIL=false desliga). */
export const emailRequired = () => config.requireEmail && mailEnabled();

// Por rede. IPv4 um pouco mais folgado: no celular e em várias operadoras muita gente divide o mesmo IPv4 (CGNAT).
// IPv6 por bloco /64 (uma casa, ou uma máquina na nuvem) e, por cima, por /48 (quem aluga várias máquinas no
// mesmo provedor). Fica tudo na memória, com a rede embaralhada (ver networkKey), e some em até 24 h.
const v4Hour = limiter(5, HOUR);
const v4Day = limiter(10, DAY);
const v6Hour = limiter(3, HOUR);
const v6Day = limiter(5, DAY);
const v6Wide = limiter(10, DAY);

const local = (ip: string) => !ip || /^(127\.|::1$|::ffff:127\.)/.test(ip);

/** Pode criar (ou começar a criar) uma conta desta rede agora? Cada chamada conta como uma tentativa. */
export function signupAllowed(req: Request): boolean {
  const ip = req.ip ?? '';
  if (local(ip)) return true;
  if (isIpv6(ip)) {
    const net = networkKey(ip, 64);
    return v6Hour(net) && v6Day(net) && v6Wide(networkKey(ip, 48));
  }
  const net = networkKey(ip);
  return v4Hour(net) && v4Day(net);
}

export const SIGNUP_LIMITED = 'Muitas contas criadas desta rede. Tente de novo mais tarde.';

// ------------------------------------------------------------------ captcha (Cloudflare Turnstile)

/** A chave pública do widget, se o captcha está ligado (o app mostra o widget só com ela). */
export const captchaSiteKey = () => (config.turnstile.siteKey && config.turnstile.secret ? config.turnstile.siteKey : null);

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
    .then((r) => r.json() as Promise<{ success?: boolean }>)
    .catch(() => null);
  if (!result?.success) fail(400, 'Não deu para confirmar que você não é um robô. Tente de novo.');
}
