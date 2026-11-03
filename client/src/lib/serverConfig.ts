// O que esta instalação do Concord oferece no cadastro (GET /api/config): e-mail obrigatório e captcha.
// Pedido uma vez só por abertura do app.
import { useEffect, useState } from 'react';
import { api } from './api';

export interface SignupConfig {
  /** cadastro com senha pede e-mail, confirmado por um código */
  emailRequired: boolean;
  /** chave pública do captcha da Cloudflare (Turnstile); null: sem captcha */
  captchaSiteKey: string | null;
}

let cache: Promise<SignupConfig> | null = null;

export const loadSignupConfig = () =>
  (cache ??= api
    .get<Partial<SignupConfig>>('/config')
    .then((c) => ({ emailRequired: !!c.emailRequired, captchaSiteKey: c.captchaSiteKey || null }))
    .catch(() => {
      cache = null;
      return { emailRequired: false, captchaSiteKey: null };
    }));

/** null enquanto carrega. */
export function useSignupConfig() {
  const [config, setConfig] = useState<SignupConfig | null>(null);
  useEffect(() => void loadSignupConfig().then(setConfig), []);
  return config;
}
