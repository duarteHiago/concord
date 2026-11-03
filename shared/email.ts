// E-mail da conta (obrigatório para quem cria conta com senha, ver server/src/api.ts): só dos provedores
// grandes, e um e-mail por conta. "Um e-mail" conta os apelidos que caem na mesma caixa de entrada: no Gmail
// os pontos e o "+algo" não mudam nada (fu.lano+1@gmail.com é fulano@gmail.com), e Outlook e iCloud também
// entregam "nome+algo" para "nome". Iguais no servidor e no app.

export const EMAIL_PROVIDERS = [
  { name: 'Gmail', domains: ['gmail.com', 'googlemail.com'] },
  { name: 'Outlook / Hotmail', domains: ['outlook.com', 'outlook.com.br', 'hotmail.com', 'hotmail.com.br', 'live.com', 'msn.com'] },
  { name: 'Yahoo', domains: ['yahoo.com', 'yahoo.com.br', 'ymail.com', 'rocketmail.com'] },
  { name: 'iCloud', domains: ['icloud.com', 'me.com', 'mac.com'] },
] as const;

/** "Gmail, Outlook / Hotmail, Yahoo ou iCloud", para as mensagens. */
export const EMAIL_PROVIDER_NAMES = EMAIL_PROVIDERS.map((p) => p.name).join(', ').replace(/, ([^,]+)$/, ' ou $1');

const ALLOWED = new Set<string>(EMAIL_PROVIDERS.flatMap((p) => p.domains));

/** Formato básico; a confirmação de verdade é o código (ou o link) que chega na caixa de entrada. */
export const isEmailFormat = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

export const emailDomainAllowed = (email: string) => ALLOWED.has(domainOf(email));

/** A caixa de entrada de verdade por trás do endereço: é por ela que vale "um e-mail por conta". */
export function emailKey(email: string): string {
  const at = email.lastIndexOf('@');
  let local = email.slice(0, at).toLowerCase();
  let domain = email.slice(at + 1).toLowerCase();
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}
